/**
 * GET /api/ai/generation-status?jobId=...&storyId=...
 * Returns the status of an image generation job. Can look up by jobId or
 * fetch the most recent active job for a storyId (via image tables).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	generationJob,
	sectionImage,
	characterImage,
	section,
	chapter,
	character,
	story
} from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const jobId = url.searchParams.get('jobId');
	const storyId = url.searchParams.get('storyId');

	if (!jobId && !storyId) throw error(400, 'Provide jobId or storyId');

	let job;

	if (jobId) {
		// Look up job by ID — verify the user owns it by checking linked images
		job = await db.query.generationJob.findFirst({
			where: eq(generationJob.id, jobId)
		});

		if (job) {
			const ownsJob = await verifyJobOwnership(jobId, locals.user.id);
			if (!ownsJob) job = null;
		}
	} else if (storyId) {
		// Verify story ownership
		const storyRow = await db.query.story.findFirst({
			where: and(eq(story.id, storyId), eq(story.userId, locals.user.id))
		});
		if (!storyRow) throw error(404, 'Story not found');

		// Find the most recent generation job linked to this story's section images
		const recentSecImg = await db
			.select({ generationJobId: sectionImage.generationJobId })
			.from(sectionImage)
			.innerJoin(section, eq(sectionImage.sectionId, section.id))
			.innerJoin(chapter, eq(section.chapterId, chapter.id))
			.where(
				and(
					eq(chapter.storyId, storyId),
					sql`${sectionImage.generationJobId} IS NOT NULL`
				)
			)
			.orderBy(desc(sectionImage.createdAt))
			.limit(1);

		const jobIdFromImages = recentSecImg[0]?.generationJobId;
		if (jobIdFromImages) {
			job = await db.query.generationJob.findFirst({
				where: eq(generationJob.id, jobIdFromImages)
			});
		}
	}

	if (!job) {
		return json({ job: null });
	}

	return json({
		job: {
			id: job.id,
			status: job.status,
			totalItems: job.totalItems,
			completedItems: job.completedItems,
			failedItems: job.failedItems,
			creditsReserved: job.creditsReserved,
			creditsConsumed: job.creditsConsumed,
			errorLog: job.errorLog,
			createdAt: job.createdAt,
			updatedAt: job.updatedAt
		}
	});
};

/** Check if a generation job's images belong to the user's stories. */
async function verifyJobOwnership(jobId: string, userId: string): Promise<boolean> {
	// Check section images → section → chapter → story
	const [secImg] = await db
		.select({ sectionId: sectionImage.sectionId })
		.from(sectionImage)
		.where(eq(sectionImage.generationJobId, jobId))
		.limit(1);

	if (secImg) {
		const [secRow] = await db
			.select({ chapterId: section.chapterId })
			.from(section)
			.where(eq(section.id, secImg.sectionId));
		if (secRow) {
			const [chapRow] = await db
				.select({ storyId: chapter.storyId })
				.from(chapter)
				.where(eq(chapter.id, secRow.chapterId));
			if (chapRow) {
				const storyRow = await db.query.story.findFirst({
					where: and(eq(story.id, chapRow.storyId), eq(story.userId, userId))
				});
				return !!storyRow;
			}
		}
	}

	// Check character images → character → story
	const [charImg] = await db
		.select({ characterId: characterImage.characterId })
		.from(characterImage)
		.where(eq(characterImage.generationJobId, jobId))
		.limit(1);

	if (charImg) {
		const [charRow] = await db
			.select({ storyId: character.storyId })
			.from(character)
			.where(eq(character.id, charImg.characterId));
		if (charRow) {
			const storyRow = await db.query.story.findFirst({
				where: and(eq(story.id, charRow.storyId), eq(story.userId, userId))
			});
			return !!storyRow;
		}
	}

	return false;
}
