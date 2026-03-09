/**
 * Cron job (every minute): polls Google Batch API for completed operations.
 *
 * For each submitted generation_job with a Google operation ID:
 *   - GET the operation status from Google
 *   - If still running, update status to 'processing'
 *   - If done with error, mark failed and refund credits
 *   - If done with results, download the responsesFile JSONL, stream line-by-line:
 *     - Parse key format: {entityType}-{imageTableId}
 *     - Route to handler based on entityType: section, character, or location
 *   - Refund credits for any individual failures
 */
import { db } from '$lib/server/db';
import {
	generationJob,
	section,
	sectionImage,
	characterImage,
	locationImage,
	character,
	location,
	chapter,
	story,
	apiUsageLog
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { extractImageFromGeminiResponse } from '$lib/server/ai/gemini-utils';
import { refundCredits } from '$lib/server/credits';
import { uploadImage } from '$lib/server/bucket';
import { createWriteStream } from 'node:fs';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const CREDITS_PER_IMAGE = 1;
const DEBUG = () => env.DEBUG_POLL === 'true';

function debug(...args: unknown[]) {
	if (DEBUG()) console.log('[poll-generations]', ...args);
}

/** Main entry: find all submitted jobs and poll each one. */
export async function pollPendingJobs() {
	const apiKey = env.GOOGLE_API_KEY;
	if (!apiKey) return;
	// console.log('poll pending');

	const pendingJobs = await db
		.select()
		.from(generationJob)
		.where(
			sql`${generationJob.status} IN ('submitted') AND ${generationJob.googleOperationIds} IS NOT NULL`
		);

	// console.log('pending', pendingJobs);

	for (const job of pendingJobs) {
		try {
			// console.log('test1');

			await pollSingleJob(job, apiKey);
		} catch (err) {
			console.error(`[poll-generations] Error polling job ${job.id}:`, err);
		}
	}
}

/** Poll a single Google Batch operation and process results using key-based routing. */
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
	debug('Operation status:', JSON.stringify(operation).slice(0, 2000));

	if (!operation.done) {
		if (job.status === 'submitted') {
			await db
				.update(generationJob)
				.set({ status: 'processing' })
				.where(eq(generationJob.id, job.id));
		}
		return;
	}

	console.log(`[poll-generations] Batch done for job ${job.id}`);

	// Operation is done — check for error
	if (operation.error) {
		await db
			.update(generationJob)
			.set({
				status: 'failed',
				errorLog: [{ error: operation.error.message || 'Batch operation failed' }]
			})
			.where(eq(generationJob.id, job.id));

		await markAllImagesStatus(job.id, 'failed');
		return;
	}

	const response = operation.response;
	if (!response) {
		await db
			.update(generationJob)
			.set({ status: 'failed', errorLog: [{ error: 'No response in completed operation' }] })
			.where(eq(generationJob.id, job.id));

		// Look up userId for refund via image tables
		const userId = await findUserIdForJob(job.id);
		if (userId) {
			await refundCredits(userId, job.creditsReserved, 'refund', job.id);
		}
		await markAllImagesStatus(job.id, 'failed');
		return;
	}

	const responsesFile = response.responsesFile as string | undefined;
	debug('responsesFile:', responsesFile);

	if (!responsesFile) {
		console.error(
			'[poll-generations] No responsesFile in batch result. Response keys:',
			Object.keys(response)
		);
		await db
			.update(generationJob)
			.set({
				status: 'failed',
				errorLog: [
					{ error: 'No responsesFile in batch result', responseKeys: Object.keys(response) }
				]
			})
			.where(eq(generationJob.id, job.id));
		await markAllImagesStatus(job.id, 'failed');
		return;
	}

	await processBatchResults(job, responsesFile, apiKey);
}

// ─── Download responsesFile ─────────────────────────────────────────────────

async function downloadResponsesFile(responsesFile: string, apiKey: string): Promise<string> {
	const url = `https://generativelanguage.googleapis.com/download/v1beta/${responsesFile}:download?key=${apiKey}&alt=media`;
	debug('Downloading responsesFile from:', url.replace(apiKey, '***'));

	const res = await fetch(url, {
		method: 'GET',
		headers: { 'Content-Type': 'application/json' }
	});
	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`Failed to download responsesFile: ${res.status} ${errText}`);
	}

	if (!res.body) {
		throw new Error('No body in responsesFile download response');
	}

	const tmpPath = join(tmpdir(), `batch-responses-${crypto.randomUUID()}.jsonl`);
	const writeStream = createWriteStream(tmpPath);

	await pipeline(Readable.fromWeb(res.body as any), writeStream);

	debug('Downloaded responsesFile to:', tmpPath);
	return tmpPath;
}

async function* readJsonlLines(filePath: string) {
	const rl = createInterface({
		input: createReadStream(filePath),
		crlfDelay: Infinity
	});

	for await (const line of rl) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		yield JSON.parse(trimmed);
	}
}

// ─── Unified Batch Results Processor ─────────────────────────────────────────

/** Process batch results using key-based routing: {entityType}-{imageTableId} */
async function processBatchResults(
	job: typeof generationJob.$inferSelect,
	responsesFile: string,
	apiKey: string
) {
	let tmpPath: string | null = null;
	try {
		tmpPath = await downloadResponsesFile(responsesFile, apiKey);
	} catch (err) {
		console.error('[poll-generations] Failed to download responsesFile:', err);
		await db
			.update(generationJob)
			.set({
				status: 'failed',
				errorLog: [
					{ error: err instanceof Error ? err.message : 'Failed to download responses file' }
				]
			})
			.where(eq(generationJob.id, job.id));
		await markAllImagesStatus(job.id, 'failed');
		return;
	}

	let completed = 0;
	let failed = 0;
	const errors: Array<{ imageId: string; error: string }> = [];
	// Track userId per story for refunds (cache lookups)
	const storyUserCache = new Map<string, string>();

	try {
		for await (const entry of readJsonlLines(tmpPath)) {
			const key = entry.key || '';
			// Key format: {entityType}-{imageTableId}
			const dashIdx = key.indexOf('-');
			if (dashIdx === -1) {
				debug('Skipping entry with invalid key:', key);
				continue;
			}

			const entityType = key.substring(0, dashIdx);
			const imageTableId = key.substring(dashIdx + 1);
			debug(`Processing ${entityType} entry, imageTableId: ${imageTableId}`);

			try {
				if (entry.response?.error) {
					throw new Error(entry.response.error.message || 'Generation failed');
				}

				const candidate = entry.response?.candidates?.[0];
				if (!candidate) {
					debug(
						'No candidate. Full entry.response:',
						JSON.stringify(entry.response)?.slice(0, 2000)
					);
					throw new Error('No candidate in response');
				}

				const imageData = extractImageFromGeminiResponse(candidate);
				if (!imageData) {
					debug('No image in candidate:', JSON.stringify(candidate)?.slice(0, 2000));
					throw new Error('No image in response');
				}
				debug(`Image extracted: mime=${imageData.mimeType}, size=${imageData.buffer.length}`);

				const imageId = crypto.randomUUID();
				const ext = imageData.mimeType === 'image/jpeg' ? 'jpg' : 'png';

				if (entityType === 'section') {
					await processSectionResult(imageTableId, imageId, ext, imageData, job.id);
				} else if (entityType === 'character') {
					await processCharacterResult(imageTableId, imageId, ext, imageData, job.id);
				} else if (entityType === 'location') {
					await processLocationResult(imageTableId, imageId, ext, imageData, job.id);
				} else {
					debug('Unknown entity type:', entityType);
					continue;
				}

				await db.insert(apiUsageLog).values({
					generationJobId: job.id,
					apiType: 'image_generation',
					modelName: env.IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation',
					imageCount: 1
				});

				completed++;
				debug(`Entry completed. Total: ${completed}`);
			} catch (err) {
				failed++;
				debug('Entry FAILED:', err instanceof Error ? err.message : err);
				errors.push({
					imageId: imageTableId,
					error: err instanceof Error ? err.message : 'Unknown error'
				});

				// Mark the specific image as failed
				if (entityType === 'section') {
					await db
						.update(sectionImage)
						.set({ status: 'failed' })
						.where(eq(sectionImage.id, imageTableId));
				} else if (entityType === 'character') {
					await db
						.update(characterImage)
						.set({ status: 'failed' })
						.where(eq(characterImage.id, imageTableId));
				} else if (entityType === 'location') {
					await db
						.update(locationImage)
						.set({ status: 'failed' })
						.where(eq(locationImage.id, imageTableId));
				}
			}
		}
	} finally {
		if (tmpPath) await unlink(tmpPath).catch(() => {});
	}

	const finalStatus = failed === job.totalItems ? 'failed' : failed > 0 ? 'partial' : 'completed';
	console.log(
		`[poll-generations] Batch done — completed: ${completed}, failed: ${failed}, status: ${finalStatus}`
	);

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

	if (failed > 0) {
		const userId = await findUserIdForJob(job.id);
		if (userId) {
			await refundCredits(userId, failed * CREDITS_PER_IMAGE, 'refund', job.id);
		}
	}
}

// ─── Per-entity result processors ────────────────────────────────────────────

async function processSectionResult(
	imageTableId: string,
	imageId: string,
	ext: string,
	imageData: { buffer: Buffer; mimeType: string },
	jobId: string
) {
	// Look up sectionId from the sectionImage row
	const [imgRow] = await db
		.select({ sectionId: sectionImage.sectionId })
		.from(sectionImage)
		.where(eq(sectionImage.id, imageTableId));

	if (!imgRow) throw new Error('Section image row not found');

	// Look up storyId: section → chapter → story
	const [secRow] = await db
		.select({ chapterId: section.chapterId })
		.from(section)
		.where(eq(section.id, imgRow.sectionId));

	if (!secRow) throw new Error('Section not found');

	const [chapRow] = await db
		.select({ storyId: chapter.storyId })
		.from(chapter)
		.where(eq(chapter.id, secRow.chapterId));

	const storyId = chapRow?.storyId;
	if (!storyId) throw new Error('Story not found for section');

	const imageKey = `stories/${storyId}/sections/${imgRow.sectionId}/${imageId}.${ext}`;
	debug('Uploading section image:', imageKey);
	await uploadImage(imageData.buffer, imageKey, imageData.mimeType);

	// Update existing sectionImage row
	await db
		.update(sectionImage)
		.set({ imageId, status: 'complete' })
		.where(eq(sectionImage.id, imageTableId));

	await db.update(section).set({ status: 'complete' }).where(eq(section.id, imgRow.sectionId));
}

async function processCharacterResult(
	imageTableId: string,
	imageId: string,
	ext: string,
	imageData: { buffer: Buffer; mimeType: string },
	jobId: string
) {
	const [imgRow] = await db
		.select({ characterId: characterImage.characterId })
		.from(characterImage)
		.where(eq(characterImage.id, imageTableId));

	if (!imgRow) throw new Error('Character image row not found');

	const [charRow] = await db
		.select({ storyId: character.storyId })
		.from(character)
		.where(eq(character.id, imgRow.characterId));

	const storyId = charRow?.storyId;
	if (!storyId) throw new Error('Story not found for character');

	const imageKey = `stories/${storyId}/characters/${imgRow.characterId}/${imageId}.${ext}`;
	debug('Uploading character image:', imageKey);
	await uploadImage(imageData.buffer, imageKey, imageData.mimeType);

	await db
		.update(characterImage)
		.set({ isPrimary: false })
		.where(eq(characterImage.characterId, imgRow.characterId));

	await db
		.update(characterImage)
		.set({ imageId, status: 'complete', isPrimary: true })
		.where(eq(characterImage.id, imageTableId));
}

async function processLocationResult(
	imageTableId: string,
	imageId: string,
	ext: string,
	imageData: { buffer: Buffer; mimeType: string },
	jobId: string
) {
	const [imgRow] = await db
		.select({ locationId: locationImage.locationId })
		.from(locationImage)
		.where(eq(locationImage.id, imageTableId));

	if (!imgRow) throw new Error('Location image row not found');

	const [locRow] = await db
		.select({ storyId: location.storyId })
		.from(location)
		.where(eq(location.id, imgRow.locationId));

	const storyId = locRow?.storyId;
	if (!storyId) throw new Error('Story not found for location');

	const imageKey = `stories/${storyId}/locations/${imgRow.locationId}/${imageId}.${ext}`;
	debug('Uploading location image:', imageKey);
	await uploadImage(imageData.buffer, imageKey, imageData.mimeType);

	await db
		.update(locationImage)
		.set({ isPrimary: false })
		.where(eq(locationImage.locationId, imgRow.locationId));

	await db
		.update(locationImage)
		.set({ imageId, status: 'complete', isPrimary: true })
		.where(eq(locationImage.id, imageTableId));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Bulk-update the status of all image types tied to a generation job. */
async function markAllImagesStatus(jobId: string, status: string) {
	await db.update(characterImage).set({ status }).where(eq(characterImage.generationJobId, jobId));
	await db.update(locationImage).set({ status }).where(eq(locationImage.generationJobId, jobId));
	await db.update(sectionImage).set({ status }).where(eq(sectionImage.generationJobId, jobId));
}

/** Find a userId for refund by looking up images linked to this job. */
async function findUserIdForJob(jobId: string): Promise<string | null> {
	// Try character images first
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
			const [storyRow] = await db
				.select({ userId: story.userId })
				.from(story)
				.where(eq(story.id, charRow.storyId));
			if (storyRow) return storyRow.userId;
		}
	}

	// Try section images
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
				const [storyRow] = await db
					.select({ userId: story.userId })
					.from(story)
					.where(eq(story.id, chapRow.storyId));
				if (storyRow) return storyRow.userId;
			}
		}
	}

	// Try location images
	const [locImg] = await db
		.select({ locationId: locationImage.locationId })
		.from(locationImage)
		.where(eq(locationImage.generationJobId, jobId))
		.limit(1);

	if (locImg) {
		const [locRow] = await db
			.select({ storyId: location.storyId })
			.from(location)
			.where(eq(location.id, locImg.locationId));
		if (locRow) {
			const [storyRow] = await db
				.select({ userId: story.userId })
				.from(story)
				.where(eq(story.id, locRow.storyId));
			if (storyRow) return storyRow.userId;
		}
	}

	console.error(`[poll-generations] Could not find userId for job ${jobId}`);
	return null;
}
