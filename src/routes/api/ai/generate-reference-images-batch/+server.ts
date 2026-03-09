/**
 * POST /api/ai/generate-reference-images-batch
 * Queues multiple character/location reference images for batch generation.
 *
 * For each item, builds the appropriate prompt (new or edit), creates a
 * characterImage/locationImage row with status='queued', and reserves 1 credit.
 * The queued rows are picked up by the process-ref-image-queue cron job every 15 minutes.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	story,
	character,
	location,
	characterImage,
	locationImage
} from '$lib/server/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

const CREDITS_PER_IMAGE = 1;

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

	// Load entities to build prompts
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

	let queued = 0;

	for (const item of items) {
		let prompt: string;

		if (item.entityType === 'character') {
			const char = charMap.get(item.entityId);
			if (!char) continue;

			if (item.editPrompt) {
				prompt = buildCharacterEditPrompt(char, item.editPrompt, project);
			} else {
				prompt = buildCharacterPrompt(char, project);
			}

			// Get current version count
			const existing = await db
				.select({ id: characterImage.id })
				.from(characterImage)
				.where(eq(characterImage.characterId, item.entityId));

			await db.insert(characterImage).values({
				characterId: item.entityId,
				imageId: null,
				imageType: 'reference',
				prompt,
				status: 'queued',
				version: existing.length + 1,
				isPrimary: false,
				generationJobId: null
			});
			queued++;
		} else {
			const loc = locMap.get(item.entityId);
			if (!loc) continue;

			if (item.editPrompt) {
				prompt = buildLocationEditPrompt(loc, item.editPrompt, project);
			} else {
				prompt = buildLocationPrompt(loc, project);
			}

			const existing = await db
				.select({ id: locationImage.id })
				.from(locationImage)
				.where(eq(locationImage.locationId, item.entityId));

			await db.insert(locationImage).values({
				locationId: item.entityId,
				imageId: null,
				imageType: 'reference',
				prompt,
				status: 'queued',
				version: existing.length + 1,
				isPrimary: false,
				generationJobId: null
			});
			queued++;
		}
	}

	return json({
		success: true,
		queued,
		creditsReserved: totalCredits
	});
};

/** Build a fresh character reference sheet prompt from the character's visual/text description. */
function buildCharacterPrompt(
	char: { name: string; role: string; visualDescription: string | null; description: string | null },
	project: { artStyle: string | null; genre: string | null }
) {
	const parts = [
		`Generate a single character reference sheet illustration for: ${char.name}.`,
		`Role: ${char.role}.`
	];
	if (char.visualDescription) parts.push(`Visual appearance: ${char.visualDescription}.`);
	else if (char.description) parts.push(`Description: ${char.description}.`);
	if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
	if (project.genre) parts.push(`Genre context: ${project.genre}.`);
	parts.push('IMPORTANT: Do NOT include any speech bubbles, text, dialogue, captions, or written words in the image. Show only the character illustration with no text elements whatsoever.');
	return parts.join('\n');
}

/** Build a character image edit prompt — modifies an existing image based on user instructions. */
function buildCharacterEditPrompt(
	char: { name: string; visualDescription: string | null; description: string | null },
	editPrompt: string,
	project: { artStyle: string | null; genre: string | null }
) {
	const parts = [
		`Edit the character reference image of ${char.name}.`,
		`Changes requested: ${editPrompt}.`,
		`Character details: ${char.visualDescription || char.description || char.name}.`
	];
	if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
	parts.push('IMPORTANT: Do NOT include any speech bubbles, text, dialogue, captions, or written words in the image. Show only the character illustration with no text elements whatsoever.');
	return parts.join('\n');
}

/** Build a fresh location environment concept art prompt. */
function buildLocationPrompt(
	loc: { name: string; visualDescription: string | null; description: string | null },
	project: { artStyle: string | null; genre: string | null }
) {
	const parts = [
		`Generate a reference image for the location/scene: ${loc.name}.`
	];
	if (loc.visualDescription) parts.push(`Visual description: ${loc.visualDescription}.`);
	else if (loc.description) parts.push(`Description: ${loc.description}.`);
	if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
	if (project.genre) parts.push(`Genre context: ${project.genre}.`);
	parts.push('IMPORTANT: This is a background/environment scene ONLY. Do NOT include any characters, people, figures, speech bubbles, text, dialogue, captions, or written words in the image. Show only the location/scenery with no characters or text elements whatsoever.');
	return parts.join('\n');
}

/** Build a location image edit prompt — modifies an existing location image based on user instructions. */
function buildLocationEditPrompt(
	loc: { name: string; visualDescription: string | null; description: string | null },
	editPrompt: string,
	project: { artStyle: string | null; genre: string | null }
) {
	const parts = [
		`Edit the location reference image of ${loc.name}.`,
		`Changes requested: ${editPrompt}.`,
		`Location details: ${loc.visualDescription || loc.description || loc.name}.`
	];
	if (project.artStyle) parts.push(`Art style: ${project.artStyle}.`);
	parts.push('IMPORTANT: This is a background/environment scene ONLY. Do NOT include any characters, people, figures, speech bubbles, text, dialogue, captions, or written words in the image. Show only the location/scenery with no characters or text elements whatsoever.');
	return parts.join('\n');
}
