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
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { checkSufficientCredits, reserveCredits, refundCredits } from '$lib/server/credits';
import { extractImageFromGeminiResponse } from '$lib/server/ai/gemini-utils';
import { uploadImage } from '$lib/server/bucket';
import { env } from '$env/dynamic/private';

const CREDITS_PER_IMAGE = 1;
const CONCURRENCY = 3;

interface BatchItem {
	entityType: 'character' | 'location';
	entityId: string;
	editPrompt?: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const body = await request.json();
	const { storyId, items } = body as { storyId: string; items: BatchItem[] };

	if (!storyId || !items || items.length === 0) {
		throw error(400, 'Missing storyId or items');
	}

	// Verify story ownership
	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	const totalCredits = items.length * CREDITS_PER_IMAGE;
	const { sufficient } = await checkSufficientCredits(locals.user.id, totalCredits);
	if (!sufficient) throw error(402, 'NO_CREDITS');

	await reserveCredits(locals.user.id, totalCredits, 'image_gen');

	// Build prompts for each item
	const charIds = items.filter((i) => i.entityType === 'character').map((i) => i.entityId);
	const locIds = items.filter((i) => i.entityType === 'location').map((i) => i.entityId);

	const chars =
		charIds.length > 0
			? await db
					.select()
					.from(character)
					.where(and(inArray(character.id, charIds), isNull(character.deletedAt)))
			: [];
	const locs =
		locIds.length > 0
			? await db
					.select()
					.from(location)
					.where(and(inArray(location.id, locIds), isNull(location.deletedAt)))
			: [];

	const charMap = new Map(chars.map((c) => [c.id, c]));
	const locMap = new Map(locs.map((l) => [l.id, l]));

	const itemsWithPrompts = items.map((item) => {
		let prompt: string;
		if (item.entityType === 'character') {
			const char = charMap.get(item.entityId);
			if (!char) throw error(404, `Character ${item.entityId} not found`);
			if (item.editPrompt) {
				prompt = `Edit the existing character reference image of ${char.name}. Changes requested: ${item.editPrompt}. Character details: ${char.visualDescription || char.description || char.name}`;
			} else {
				const parts = [`Generate a character reference sheet for: ${char.name}`];
				if (char.role) parts.push(`Role: ${char.role}`);
				if (char.visualDescription) parts.push(`Visual appearance: ${char.visualDescription}`);
				else if (char.description) parts.push(`Description: ${char.description}`);
				if (project.artStyle) parts.push(`Art style: ${project.artStyle}`);
				if (project.genre) parts.push(`Genre: ${project.genre}`);
				prompt = parts.join('\n');
			}
		} else {
			const loc = locMap.get(item.entityId);
			if (!loc) throw error(404, `Location ${item.entityId} not found`);
			if (item.editPrompt) {
				prompt = `Edit the existing location reference image of ${loc.name}. Changes requested: ${item.editPrompt}. Location details: ${loc.visualDescription || loc.description || loc.name}`;
			} else {
				const parts = [`Generate a reference image for location: ${loc.name}`];
				if (loc.visualDescription) parts.push(`Visual description: ${loc.visualDescription}`);
				else if (loc.description) parts.push(`Description: ${loc.description}`);
				if (project.artStyle) parts.push(`Art style: ${project.artStyle}`);
				if (project.genre) parts.push(`Genre: ${project.genre}`);
				prompt = parts.join('\n');
			}
		}
		return { ...item, prompt };
	});

	const [job] = await db
		.insert(generationJob)
		.values({
			userId: locals.user.id,
			storyId,
			jobType: 'character_sheet',
			status: 'processing',
			totalItems: items.length,
			creditsReserved: totalCredits
		})
		.returning();

	// Fire-and-forget background processing
	processInBackground(job.id, locals.user.id, storyId, itemsWithPrompts).catch((err) => {
		console.error('[ref-image-batch] Background processing error:', err);
	});

	return json({
		success: true,
		jobId: job.id,
		totalImages: items.length,
		creditsUsed: totalCredits
	});
};

async function processInBackground(
	jobId: string,
	userId: string,
	storyId: string,
	items: Array<BatchItem & { prompt: string }>
) {
	let completed = 0;
	let failed = 0;
	const errors: Array<{ entityId: string; error: string }> = [];

	for (let i = 0; i < items.length; i += CONCURRENCY) {
		const batch = items.slice(i, i + CONCURRENCY);
		const results = await Promise.allSettled(
			batch.map((item) => generateSingleRefImage(jobId, storyId, item))
		);

		for (let j = 0; j < results.length; j++) {
			if (results[j].status === 'fulfilled') {
				completed++;
			} else {
				failed++;
				errors.push({
					entityId: batch[j].entityId,
					error: (results[j] as PromiseRejectedResult).reason?.message || 'Unknown error'
				});
			}

			await db
				.update(generationJob)
				.set({ completedItems: completed, failedItems: failed })
				.where(eq(generationJob.id, jobId));
		}
	}

	const finalStatus = failed === items.length ? 'failed' : failed > 0 ? 'partial' : 'completed';

	await db
		.update(generationJob)
		.set({
			status: finalStatus,
			creditsConsumed: completed * CREDITS_PER_IMAGE,
			errorLog: errors.length > 0 ? errors : null
		})
		.where(eq(generationJob.id, jobId));

	if (failed > 0) {
		await refundCredits(userId, failed * CREDITS_PER_IMAGE, 'refund', jobId);
	}
}

async function generateSingleRefImage(
	jobId: string,
	storyId: string,
	item: BatchItem & { prompt: string }
) {
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
				contents: [{ role: 'user', parts: [{ text: item.prompt }] }],
				generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
			})
		}
	);

	const durationMs = Date.now() - startTime;

	if (!response.ok) {
		const errText = await response.text();
		console.error('[ref-image-batch] Gemini API error:', response.status, errText);
		throw new Error('Image generation failed');
	}

	const result = await response.json();
	const candidate = result.candidates?.[0];
	if (!candidate) throw new Error('No candidate in response');

	const imageData = extractImageFromGeminiResponse(candidate);
	if (!imageData) throw new Error('No image in response');

	const imageId = crypto.randomUUID();
	const ext = imageData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
	const key = `stories/${storyId}/${item.entityType}s/${item.entityId}/${imageId}.${ext}`;
	await uploadImage(imageData.buffer, key, imageData.mimeType);

	if (item.entityType === 'character') {
		const existing = await db
			.select({ id: characterImage.id })
			.from(characterImage)
			.where(eq(characterImage.characterId, item.entityId));

		if (existing.length > 0) {
			await db
				.update(characterImage)
				.set({ isPrimary: false })
				.where(eq(characterImage.characterId, item.entityId));
		}

		await db.insert(characterImage).values({
			characterId: item.entityId,
			imageUrl: imageId,
			imageType: 'reference',
			prompt: item.prompt,
			version: existing.length + 1,
			isPrimary: true,
			generationJobId: jobId
		});
	} else {
		const existing = await db
			.select({ id: locationImage.id })
			.from(locationImage)
			.where(eq(locationImage.locationId, item.entityId));

		if (existing.length > 0) {
			await db
				.update(locationImage)
				.set({ isPrimary: false })
				.where(eq(locationImage.locationId, item.entityId));
		}

		await db.insert(locationImage).values({
			locationId: item.entityId,
			imageUrl: imageId,
			imageType: 'reference',
			prompt: item.prompt,
			version: existing.length + 1,
			isPrimary: true,
			generationJobId: jobId
		});
	}

	await db.insert(apiUsageLog).values({
		generationJobId: jobId,
		apiType: 'image_generation',
		modelName: imageModel,
		imageCount: 1,
		requestDurationMs: durationMs
	});
}
