import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { generationJob } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const jobId = url.searchParams.get('jobId');
	const storyId = url.searchParams.get('storyId');

	if (!jobId && !storyId) throw error(400, 'Provide jobId or storyId');

	let job;

	if (jobId) {
		job = await db.query.generationJob.findFirst({
			where: and(eq(generationJob.id, jobId), eq(generationJob.userId, locals.user.id))
		});
	} else if (storyId) {
		// Get the most recent job for this story
		const jobs = await db
			.select()
			.from(generationJob)
			.where(and(eq(generationJob.storyId, storyId), eq(generationJob.userId, locals.user.id)))
			.orderBy(desc(generationJob.createdAt))
			.limit(1);
		job = jobs[0];
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
