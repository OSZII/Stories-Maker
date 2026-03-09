/**
 * POST /api/ai/generate-images
 * Main entry point for generating manga panel images for a story's sections.
 *
 * Supports two modes:
 *   - "fast": synchronous generation via Gemini API (2 credits/image, immediate results)
 *   - "batch": async batch generation via Google Batch API (1 credit/image, results via polling)
 *
 * Steps: verify ownership → check no active images → assemble full prompts → check credits → start generation.
 * Can optionally target specific sectionIds or generate all sections with prompts.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, chapter, section, sectionImage } from '$lib/server/db/schema';
import { eq, and, isNull, isNotNull, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { checkSufficientCredits } from '$lib/server/credits';
import { assembleImagePrompts } from '$lib/server/ai/assemble-prompt';
import { startFastGeneration } from '$lib/server/ai/image-fast';
import { startBatchGeneration } from '$lib/server/ai/image-batch';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-images] Starting image generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const body = await request.json();
	const {
		storyId,
		mode,
		sectionIds: requestedSectionIds,
		userInstructions
	} = body as {
		storyId: string;
		mode: 'batch' | 'fast';
		sectionIds?: string[];
		userInstructions?: Record<string, string>;
	};

	if (!storyId) throw error(400, 'Missing storyId');
	if (!mode || !['batch', 'fast'].includes(mode)) throw error(400, 'Invalid mode');

	// Verify story ownership
	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	// Check for active images (queued or generating) in this story's sections
	const activeImages = await db
		.select({ id: sectionImage.id })
		.from(sectionImage)
		.innerJoin(section, eq(sectionImage.sectionId, section.id))
		.innerJoin(chapter, eq(section.chapterId, chapter.id))
		.where(
			and(
				eq(chapter.storyId, storyId),
				sql`${sectionImage.status} IN ('queued', 'generating')`
			)
		)
		.limit(1);

	if (activeImages.length > 0) {
		throw error(409, 'An image generation job is already active for this story');
	}

	// Get chapters for this story
	const chapters = await db
		.select({ id: chapter.id })
		.from(chapter)
		.where(and(eq(chapter.storyId, storyId), isNull(chapter.deletedAt)));

	if (chapters.length === 0) throw error(400, 'No chapters found');

	const chapterIds = chapters.map((c) => c.id);

	// Get eligible sections (must have imagePrompt set)
	let eligibleSections;
	if (requestedSectionIds && requestedSectionIds.length > 0) {
		eligibleSections = await db
			.select({ id: section.id, imagePrompt: section.imagePrompt })
			.from(section)
			.where(
				and(
					inArray(section.id, requestedSectionIds),
					inArray(section.chapterId, chapterIds),
					isNotNull(section.imagePrompt)
				)
			);
	} else {
		eligibleSections = await db
			.select({ id: section.id, imagePrompt: section.imagePrompt })
			.from(section)
			.where(and(inArray(section.chapterId, chapterIds), isNotNull(section.imagePrompt)));
	}

	if (eligibleSections.length === 0) {
		throw error(400, 'No sections with image prompts found');
	}

	const sectionIds = eligibleSections.map((s) => s.id);

	// Assemble full prompts
	await assembleImagePrompts(storyId);

	// Apply per-section user instructions to assembled prompts
	if (userInstructions && Object.keys(userInstructions).length > 0) {
		for (const secId of sectionIds) {
			const feedback = userInstructions[secId];
			if (feedback?.trim()) {
				const [sec] = await db
					.select({ imagePromptFull: section.imagePromptFull })
					.from(section)
					.where(eq(section.id, secId));
				if (sec?.imagePromptFull) {
					await db
						.update(section)
						.set({
							imagePromptFull: `${sec.imagePromptFull}\n\nThe user provided additional instructions: <user-prompt>${feedback}</user-prompt>`
						})
						.where(eq(section.id, secId));
				}
			}
		}
	}

	// Check credits
	const creditsPerImage = mode === 'fast' ? 2 : 1;
	const totalCredits = sectionIds.length * creditsPerImage;
	const { sufficient, available } = await checkSufficientCredits(locals.user.id, totalCredits);

	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}

	// Start generation
	const result =
		mode === 'fast'
			? await startFastGeneration(locals.user.id, storyId, sectionIds)
			: await startBatchGeneration(locals.user.id, storyId, sectionIds);

	console.log(`[generate-images] Started: mode=${mode}, sections=${sectionIds.length}, jobId=${result.jobId}`);
	return json({
		success: true,
		jobId: result.jobId,
		totalImages: sectionIds.length,
		creditsUsed: totalCredits
	});
};
