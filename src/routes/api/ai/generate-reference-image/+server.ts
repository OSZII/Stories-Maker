/**
 * POST /api/ai/generate-reference-image
 * Generates a reference image for a single character or location.
 *
 * Two modes:
 *   - "fast": calls Gemini API directly, uploads result to R2, returns immediately (2 credits)
 *   - "batch": just returns the assembled prompt — caller accumulates and submits via batch endpoint
 *
 * Supports editPrompt for re-generating with specific modifications.
 * Prompt includes instructions to exclude text/speech bubbles from images.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	story,
	character,
	location,
	characterImage,
	locationImage,
	generationJob,
	apiUsageLog
} from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { checkSufficientCredits, reserveCredits, refundCredits } from '$lib/server/credits';
import { extractImageFromGeminiResponse } from '$lib/server/ai/gemini-utils';
import { uploadImage } from '$lib/server/bucket';
import { env } from '$env/dynamic/private';

const CREDITS_FAST = 2;
const CREDITS_BATCH = 1;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const body = await request.json();
	const {
		storyId,
		entityType,
		entityId,
		mode,
		editPrompt
	} = body as {
		storyId: string;
		entityType: 'character' | 'location';
		entityId: string;
		mode: 'fast' | 'batch';
		editPrompt?: string;
	};

	if (!storyId || !entityType || !entityId || !mode) {
		throw error(400, 'Missing required fields');
	}
	if (!['character', 'location'].includes(entityType)) throw error(400, 'Invalid entityType');
	if (!['fast', 'batch'].includes(mode)) throw error(400, 'Invalid mode');

	// Verify story ownership
	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	// Build prompt based on entity type
	let prompt: string;
	let entityName: string;

	if (entityType === 'character') {
		const char = await db.query.character.findFirst({
			where: and(eq(character.id, entityId), eq(character.storyId, storyId), isNull(character.deletedAt))
		});
		if (!char) throw error(404, 'Character not found');
		entityName = char.name;

		if (editPrompt) {
			const parts = [
				`Edit the character reference image of ${char.name}.`,
				`Changes requested: ${editPrompt}.`,
				`Character details: ${char.visualDescription || char.description || char.name}.`
			];
			if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
			parts.push('IMPORTANT: Do NOT include any speech bubbles, text, dialogue, captions, or written words in the image. Show only the character illustration with no text elements whatsoever.');
			prompt = parts.join('\n');
		} else {
			const parts = [
				`Generate a single character reference sheet illustration for: ${char.name}.`,
				`Role: ${char.role}.`
			];
			if (char.visualDescription) parts.push(`Visual appearance: ${char.visualDescription}.`);
			else if (char.description) parts.push(`Description: ${char.description}.`);
			if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
			if (project.genre) parts.push(`Genre context: ${project.genre}.`);
			parts.push('IMPORTANT: Do NOT include any speech bubbles, text, dialogue, captions, or written words in the image. Show only the character illustration with no text elements whatsoever.');
			prompt = parts.join('\n');
		}
	} else {
		const loc = await db.query.location.findFirst({
			where: and(eq(location.id, entityId), eq(location.storyId, storyId), isNull(location.deletedAt))
		});
		if (!loc) throw error(404, 'Location not found');
		entityName = loc.name;

		if (editPrompt) {
			const parts = [
				`Edit the location reference image of ${loc.name}.`,
				`Changes requested: ${editPrompt}.`,
				`Location details: ${loc.visualDescription || loc.description || loc.name}.`
			];
			if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
			parts.push('IMPORTANT: This is a background/environment scene ONLY. Do NOT include any characters, people, figures, speech bubbles, text, dialogue, captions, or written words in the image. Show only the location/scenery with no characters or text elements whatsoever.');
			prompt = parts.join('\n');
		} else {
			const parts = [
				`Generate a reference image for the location/scene: ${loc.name}.`
			];
			if (loc.visualDescription) parts.push(`Visual description: ${loc.visualDescription}.`);
			else if (loc.description) parts.push(`Description: ${loc.description}.`);
			if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
			if (project.genre) parts.push(`Genre context: ${project.genre}.`);
			parts.push('IMPORTANT: This is a background/environment scene ONLY. Do NOT include any characters, people, figures, speech bubbles, text, dialogue, captions, or written words in the image. Show only the location/scenery with no characters or text elements whatsoever.');
			prompt = parts.join('\n');
		}
	}

	const creditsNeeded = mode === 'fast' ? CREDITS_FAST : CREDITS_BATCH;
	const { sufficient } = await checkSufficientCredits(locals.user.id, creditsNeeded);
	if (!sufficient) throw error(402, 'NO_CREDITS');

	if (mode === 'fast') {
		// Generate immediately
		return await generateReferenceImageFast(
			locals.user.id,
			storyId,
			entityType,
			entityId,
			prompt
		);
	} else {
		// For batch mode, we just return success — the caller accumulates and submits
		return json({
			success: true,
			queued: true,
			entityType,
			entityId,
			prompt
		});
	}
};

/**
 * Fast-mode reference image generation: calls Gemini API, uploads result to R2,
 * creates a characterImage/locationImage row (marked primary), logs API usage.
 * Refunds credits on failure.
 */
async function generateReferenceImageFast(
	userId: string,
	storyId: string,
	entityType: 'character' | 'location',
	entityId: string,
	prompt: string
) {
	await reserveCredits(userId, CREDITS_FAST, 'image_gen');

	const [job] = await db
		.insert(generationJob)
		.values({
			status: 'processing',
			totalItems: 1,
			creditsReserved: CREDITS_FAST
		})
		.returning();

	try {
		const apiKey = env.GOOGLE_API_KEY;
		if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');

		const imageModel = env.IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
		const startTime = Date.now();

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${apiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents: [{ role: 'user', parts: [{ text: prompt }] }],
					generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
				})
			}
		);

		const durationMs = Date.now() - startTime;

		if (!response.ok) {
			const errText = await response.text();
			console.error('[ref-image-fast] Gemini API error:', response.status, errText);
			throw new Error('Image generation failed');
		}

		const result = await response.json();
		const candidate = result.candidates?.[0];
		if (!candidate) throw new Error('No candidate in response');

		const imageData = extractImageFromGeminiResponse(candidate);
		if (!imageData) throw new Error('No image in response');

		const imageId = crypto.randomUUID();
		const ext = imageData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
		const key = `stories/${storyId}/${entityType}s/${entityId}/${imageId}.${ext}`;
		await uploadImage(imageData.buffer, key, imageData.mimeType);

		let newImageId: string;

		if (entityType === 'character') {
			const existing = await db
				.select({ id: characterImage.id })
				.from(characterImage)
				.where(eq(characterImage.characterId, entityId));

			if (existing.length > 0) {
				await db
					.update(characterImage)
					.set({ isPrimary: false })
					.where(eq(characterImage.characterId, entityId));
			}

			const [img] = await db
				.insert(characterImage)
				.values({
					characterId: entityId,
					imageId: imageId,
					imageType: 'reference',
					prompt,
					version: existing.length + 1,
					isPrimary: true,
					generationJobId: job.id
				})
				.returning();
			newImageId = img.id;
		} else {
			const existing = await db
				.select({ id: locationImage.id })
				.from(locationImage)
				.where(eq(locationImage.locationId, entityId));

			if (existing.length > 0) {
				await db
					.update(locationImage)
					.set({ isPrimary: false })
					.where(eq(locationImage.locationId, entityId));
			}

			const [img] = await db
				.insert(locationImage)
				.values({
					locationId: entityId,
					imageId: imageId,
					imageType: 'reference',
					prompt,
					version: existing.length + 1,
					isPrimary: true,
					generationJobId: job.id
				})
				.returning();
			newImageId = img.id;
		}

		await db
			.update(generationJob)
			.set({ status: 'completed', completedItems: 1, creditsConsumed: CREDITS_FAST })
			.where(eq(generationJob.id, job.id));

		await db.insert(apiUsageLog).values({
			generationJobId: job.id,
			apiType: 'image_generation',
			modelName: env.IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation',
			imageCount: 1,
			requestDurationMs: durationMs
		});

		return json({
			success: true,
			imageId: newImageId,
			storedImageId: imageId,
			prompt
		});
	} catch (err) {
		await db
			.update(generationJob)
			.set({ status: 'failed', failedItems: 1, errorLog: [{ error: (err as Error).message }] })
			.where(eq(generationJob.id, job.id));

		await refundCredits(userId, CREDITS_FAST, 'refund', job.id);

		throw error(500, 'Image generation failed');
	}
}
