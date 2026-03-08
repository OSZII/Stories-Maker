import { db } from '$lib/server/db';
import { section, sectionImage, generationJob, apiUsageLog } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { extractImageFromGeminiResponse } from './gemini-utils';
import { reserveCredits, refundCredits } from '$lib/server/credits';
import { uploadImage } from '$lib/server/bucket';

const CONCURRENCY = 3;
const CREDITS_PER_IMAGE = 2;

export async function startFastGeneration(
	userId: string,
	storyId: string,
	sectionIds: string[]
): Promise<{ jobId: string }> {
	const totalCredits = sectionIds.length * CREDITS_PER_IMAGE;

	// Reserve credits upfront
	await reserveCredits(userId, totalCredits, 'image_gen');

	// Create job
	const [job] = await db
		.insert(generationJob)
		.values({
			userId,
			storyId,
			jobType: 'section_panel',
			status: 'processing',
			totalItems: sectionIds.length,
			creditsReserved: totalCredits
		})
		.returning();

	// Update sections to generating status
	await db.update(section).set({ status: 'generating' }).where(inArray(section.id, sectionIds));

	// Fire-and-forget background processing
	processInBackground(job.id, userId, storyId, sectionIds).catch((err) => {
		console.error('[image-fast] Background processing error:', err);
	});

	return { jobId: job.id };
}

async function processInBackground(
	jobId: string,
	userId: string,
	storyId: string,
	sectionIds: string[]
) {
	const sections = await db.select().from(section).where(inArray(section.id, sectionIds));

	let completed = 0;
	let failed = 0;
	const errors: Array<{ sectionId: string; error: string }> = [];

	// Process with limited concurrency
	for (let i = 0; i < sections.length; i += CONCURRENCY) {
		const batch = sections.slice(i, i + CONCURRENCY);
		const results = await Promise.allSettled(
			batch.map((sec) => generateSingleImage(jobId, storyId, sec))
		);

		for (let j = 0; j < results.length; j++) {
			const result = results[j];
			if (result.status === 'fulfilled') {
				completed++;
			} else {
				failed++;
				errors.push({
					sectionId: batch[j].id,
					error: result.reason?.message || 'Unknown error'
				});
			}

			await db
				.update(generationJob)
				.set({
					completedItems: completed,
					failedItems: failed
				})
				.where(eq(generationJob.id, jobId));
		}
	}

	// Finalize job
	const finalStatus = failed === sections.length ? 'failed' : failed > 0 ? 'partial' : 'completed';

	await db
		.update(generationJob)
		.set({
			status: finalStatus,
			creditsConsumed: completed * CREDITS_PER_IMAGE,
			errorLog: errors.length > 0 ? errors : null
		})
		.where(eq(generationJob.id, jobId));

	// Refund credits for failed items
	if (failed > 0) {
		await refundCredits(userId, failed * CREDITS_PER_IMAGE, 'refund', jobId);
	}
}

async function generateSingleImage(
	jobId: string,
	storyId: string,
	sec: { id: string; imagePromptFull: string | null; imagePrompt: string | null }
) {
	const prompt = sec.imagePromptFull || sec.imagePrompt;
	if (!prompt) {
		console.error('[image-fast] No image prompt available for section', sec.id);
		throw new Error('No image prompt available');
	}

	const apiKey = env.GOOGLE_API_KEY;
	if (!apiKey) {
		console.error('[image-fast] GOOGLE_API_KEY not configured');
		throw new Error('GOOGLE_API_KEY not configured');
	}

	const imageModel = env.IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';

	const startTime = Date.now();

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${apiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{ role: 'user', parts: [{ text: `Generate a manga/manhwa panel image: ${prompt}` }] }
				],
				generationConfig: {
					responseModalities: ['TEXT', 'IMAGE']
				}
			})
		}
	);

	const durationMs = Date.now() - startTime;

	if (!response.ok) {
		const errText = await response.text();
		console.error('[image-fast] Gemini API error:', response.status, errText);
		throw new Error('Image generation failed');
	}

	const result = await response.json();
	const candidate = result.candidates?.[0];
	if (!candidate) {
		console.error('[image-fast] No candidate in response for section', sec.id);
		throw new Error('No candidate in response');
	}

	const imageData = extractImageFromGeminiResponse(candidate);
	if (!imageData) {
		console.error('[image-fast] No image in response for section', sec.id);
		throw new Error('No image in response');
	}

	// Upload to R2
	const imageId = crypto.randomUUID();
	const ext = imageData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
	const key = `stories/${storyId}/sections/${sec.id}/${imageId}.${ext}`;
	await uploadImage(imageData.buffer, key, imageData.mimeType);

	// Get current version count
	const existingImages = await db
		.select({ id: sectionImage.id })
		.from(sectionImage)
		.where(eq(sectionImage.sectionId, sec.id));

	// Create sectionImage record
	await db.insert(sectionImage).values({
		sectionId: sec.id,
		imageUrl: imageId,
		version: existingImages.length + 1,
		isSelected: existingImages.length === 0, // Auto-select first image
		generationJobId: jobId
	});

	// Update section status
	await db.update(section).set({ status: 'complete' }).where(eq(section.id, sec.id));

	// Log API usage
	await db.insert(apiUsageLog).values({
		generationJobId: jobId,
		apiType: 'image_generation',
		modelName: imageModel,
		imageCount: 1,
		requestDurationMs: durationMs
	});
}
