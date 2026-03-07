import { db } from '$lib/server/db';
import { generationJob, section, sectionImage, apiUsageLog } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { extractImageFromGeminiResponse } from '$lib/server/ai/gemini-utils';
import { refundCredits } from '$lib/server/credits';
import { uploadImage } from '$lib/server/bucket';

const CREDITS_PER_IMAGE = 1; // batch mode cost

export async function pollPendingJobs() {
	const apiKey = env.GOOGLE_API_KEY;
	if (!apiKey) return;

	const pendingJobs = await db
		.select()
		.from(generationJob)
		.where(
			sql`${generationJob.status} IN ('submitted', 'processing') AND ${generationJob.googleOperationIds} IS NOT NULL`
		);

	for (const job of pendingJobs) {
		try {
			await pollSingleJob(job, apiKey);
		} catch (err) {
			console.error(`[poll-generations] Error polling job ${job.id}:`, err);
		}
	}
}

async function pollSingleJob(job: typeof generationJob.$inferSelect, apiKey: string) {
	const operationIds = job.googleOperationIds as string[];
	if (!operationIds || operationIds.length === 0) return;

	const operationName = operationIds[0];

	const res = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`
	);

	if (!res.ok) {
		console.error(`[poll-generations] Poll failed for ${operationName}: ${res.status}`);
		return;
	}

	const operation = await res.json();

	if (!operation.done) {
		// Update to processing if still pending
		if (job.status === 'submitted') {
			await db
				.update(generationJob)
				.set({ status: 'processing' })
				.where(eq(generationJob.id, job.id));
		}
		return;
	}

	// Operation is done — check for error
	if (operation.error) {
		await db
			.update(generationJob)
			.set({
				status: 'failed',
				errorLog: [{ error: operation.error.message || 'Batch operation failed' }]
			})
			.where(eq(generationJob.id, job.id));

		// Refund all reserved credits
		await refundCredits(job.userId, job.creditsReserved, 'refund', job.id);
		return;
	}

	// Process the response
	const response = operation.response;
	if (!response) {
		await db
			.update(generationJob)
			.set({ status: 'failed', errorLog: [{ error: 'No response in completed operation' }] })
			.where(eq(generationJob.id, job.id));
		await refundCredits(job.userId, job.creditsReserved, 'refund', job.id);
		return;
	}

	// The response contains inlineResponses with keys mapping to section IDs
	const inlineResponses = response.inlineResponses || [];
	let completed = 0;
	let failed = 0;
	const errors: Array<{ sectionId: string; error: string }> = [];

	for (const entry of inlineResponses) {
		const key = entry.key || '';
		const sectionId = key.replace('section-', '');

		try {
			if (entry.response?.error) {
				throw new Error(entry.response.error.message || 'Generation failed');
			}

			const candidate = entry.response?.candidates?.[0];
			if (!candidate) throw new Error('No candidate in response');

			const imageData = extractImageFromGeminiResponse(candidate);
			if (!imageData) throw new Error('No image in response');

			// Upload to R2
			const imageId = crypto.randomUUID();
			const ext = imageData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
			const imageKey = `stories/${job.storyId}/sections/${sectionId}/${imageId}.${ext}`;
			const imageUrl = await uploadImage(imageData.buffer, imageKey, imageData.mimeType);

			// Get current version count
			const existingImages = await db
				.select({ id: sectionImage.id })
				.from(sectionImage)
				.where(eq(sectionImage.sectionId, sectionId));

			// Create sectionImage record
			await db.insert(sectionImage).values({
				sectionId,
				imageUrl,
				version: existingImages.length + 1,
				isSelected: existingImages.length === 0,
				generationJobId: job.id
			});

			// Update section status
			await db.update(section).set({ status: 'complete' }).where(eq(section.id, sectionId));

			// Log API usage
			await db.insert(apiUsageLog).values({
				generationJobId: job.id,
				apiType: 'image_generation',
				modelName: env.IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation',
				imageCount: 1
			});

			completed++;
		} catch (err) {
			failed++;
			errors.push({
				sectionId,
				error: err instanceof Error ? err.message : 'Unknown error'
			});
		}
	}

	// Finalize job
	const finalStatus = failed === job.totalItems ? 'failed' : failed > 0 ? 'partial' : 'completed';

	await db
		.update(generationJob)
		.set({
			status: finalStatus,
			completedItems: completed,
			failedItems: failed,
			creditsConsumed: completed * CREDITS_PER_IMAGE,
			errorLog: errors.length > 0 ? errors : null
		})
		.where(eq(generationJob.id, job.id));

	// Refund credits for failed items
	if (failed > 0) {
		await refundCredits(job.userId, failed * CREDITS_PER_IMAGE, 'refund', job.id);
	}
}
