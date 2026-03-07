import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, chapter, section, generationJob } from '$lib/server/db/schema';
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
		sectionIds: requestedSectionIds
	} = body as {
		storyId: string;
		mode: 'batch' | 'fast';
		sectionIds?: string[];
	};

	if (!storyId) throw error(400, 'Missing storyId');
	if (!mode || !['batch', 'fast'].includes(mode)) throw error(400, 'Invalid mode');

	// Verify story ownership
	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	// Check for existing active jobs
	const activeJobs = await db
		.select({ id: generationJob.id })
		.from(generationJob)
		.where(
			and(
				eq(generationJob.storyId, storyId),
				sql`${generationJob.status} IN ('pending', 'submitted', 'processing')`
			)
		);

	if (activeJobs.length > 0) {
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
