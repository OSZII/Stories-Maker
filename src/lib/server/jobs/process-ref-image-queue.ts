/**
 * Cron job (every 15 minutes): collects all queued image rows
 * (character_image, location_image, and section_image with status='queued'),
 * builds a JSONL file, uploads it to the Gemini File API, and submits
 * a batch generation request. Creates a generation_job for tracking.
 *
 * Key format: {entityType}-{imageTableId}
 * Examples: section-img456, character-img789, location-img012
 *
 * On failure, images are reset to 'queued' so they're retried next cycle.
 */
import { db } from '$lib/server/db';
import {
	characterImage,
	locationImage,
	sectionImage,
	generationJob,
	character,
	location,
	section,
	chapter,
	story
} from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

export async function processRefImageQueue() {
	const apiKey = env.GOOGLE_API_KEY;
	if (!apiKey) return;

	// Get all queued character images
	const queuedCharImages = await db
		.select({
			id: characterImage.id,
			characterId: characterImage.characterId,
			prompt: characterImage.prompt
		})
		.from(characterImage)
		.where(eq(characterImage.status, 'queued'));

	// Get all queued location images
	const queuedLocImages = await db
		.select({
			id: locationImage.id,
			locationId: locationImage.locationId,
			prompt: locationImage.prompt
		})
		.from(locationImage)
		.where(eq(locationImage.status, 'queued'));

	// Get all queued section images
	const queuedSecImages = await db
		.select({
			id: sectionImage.id,
			sectionId: sectionImage.sectionId,
			prompt: sectionImage.prompt
		})
		.from(sectionImage)
		.where(eq(sectionImage.status, 'queued'));

	const totalQueued = queuedCharImages.length + queuedLocImages.length + queuedSecImages.length;
	if (totalQueued === 0) return;

	console.log(`[ref-image-queue] Processing ${totalQueued} queued images`);

	// Build items list with all info
	interface QueueItem {
		imageTableId: string;
		entityType: 'character' | 'location' | 'section';
		prompt: string;
	}

	const allItems: QueueItem[] = [];

	for (const ci of queuedCharImages) {
		if (!ci.prompt) continue;
		allItems.push({
			imageTableId: ci.id,
			entityType: 'character',
			prompt: ci.prompt
		});
	}

	for (const li of queuedLocImages) {
		if (!li.prompt) continue;
		allItems.push({
			imageTableId: li.id,
			entityType: 'location',
			prompt: li.prompt
		});
	}

	for (const si of queuedSecImages) {
		if (!si.prompt) continue;
		allItems.push({
			imageTableId: si.id,
			entityType: 'section',
			prompt: si.prompt
		});
	}

	if (allItems.length === 0) return;

	// Build JSONL — keys encode entity type and image table row ID
	const jsonlLines = allItems.map((item) => {
		const isSectionImage = item.entityType === 'section';
		return JSON.stringify({
			key: `${item.entityType}-${item.imageTableId}`,
			request: {
				contents: [
					{
						parts: [
							{
								text: isSectionImage
									? `Generate a single manga/manhwa panel illustration based on the following detailed scene description. Render it as a clean, professional manga panel with no speech bubbles, no text overlays, and no UI elements. Focus on cinematic composition, expressive characters, and atmospheric depth.\n\n${item.prompt}`
									: item.prompt.replaceAll('"', '"')
							}
						]
					}
				],
				generationConfig: isSectionImage
					? { responseModalities: ['TEXT', 'IMAGE'] }
					: {
							responseModalities: ['IMAGE'],
							imageConfig: {
								aspectRatio: '3:2',
								imageSize: '0.5K'
							}
						}
			}
		});
	});

	const jsonlContent = jsonlLines.join('\n');
	console.log('[ref-image-queue] JSONL content prepared, lines:', jsonlLines.length);

	const jsonlBuffer = Buffer.from(jsonlContent, 'utf-8');
	const imageModel = env.IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';

	// Create a single generation job for tracking (no userId/storyId/jobType)
	const [job] = await db
		.insert(generationJob)
		.values({
			status: 'pending',
			totalItems: allItems.length,
			creditsReserved: allItems.length // 1 credit per image already reserved at queue time
		})
		.returning();

	try {
		// Step 1: Start resumable upload to Gemini File API
		const startUploadRes = await fetch(
			`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Upload-Protocol': 'resumable',
					'X-Goog-Upload-Command': 'start',
					'X-Goog-Upload-Header-Content-Length': String(jsonlBuffer.byteLength),
					'X-Goog-Upload-Header-Content-Type': 'application/jsonl'
				},
				body: JSON.stringify({ file: { displayName: `batch-${job.id}.jsonl` } })
			}
		);

		if (!startUploadRes.ok) {
			const errText = await startUploadRes.text();
			console.error('[ref-image-queue] File upload start failed:', errText);
			throw new Error('File upload start failed');
		}

		const uploadUrl = startUploadRes.headers.get('X-Goog-Upload-URL');
		if (!uploadUrl) throw new Error('No upload URL in response');

		// Step 2: Upload JSONL
		const uploadRes = await fetch(uploadUrl, {
			method: 'PUT',
			headers: {
				'Content-Length': String(jsonlBuffer.byteLength),
				'X-Goog-Upload-Offset': '0',
				'X-Goog-Upload-Command': 'upload, finalize'
			},
			body: jsonlBuffer
		});

		if (!uploadRes.ok) {
			const errText = await uploadRes.text();
			console.error('[ref-image-queue] File upload failed:', errText);
			throw new Error('File upload failed');
		}

		const uploadResult = await uploadRes.json();
		const fileUri = uploadResult.file?.uri;
		if (!fileUri) throw new Error('No file URI in upload response');

		const fileRef = fileUri.includes('/v1beta/') ? fileUri.split('/v1beta/')[1] : fileUri;
		console.log('[ref-image-queue] fileRef:', fileRef);

		// Step 3: Create batch job
		const batchRes = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:batchGenerateContent?key=${apiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batch: {
						display_name: `batch-${crypto.randomUUID()}`,
						input_config: {
							file_name: fileRef
						}
					}
				})
			}
		);

		if (!batchRes.ok) {
			const errText = await batchRes.text();
			console.error('[ref-image-queue] Batch job creation failed:', errText);
			throw new Error('Batch job creation failed');
		}

		const batchResult = await batchRes.json();
		const operationName = batchResult.name;
		if (!operationName) throw new Error('No operation name in batch response');

		console.log('[ref-image-queue] batchResult:', JSON.stringify(batchResult));

		// Update job with operation ID
		await db
			.update(generationJob)
			.set({
				status: 'submitted',
				googleOperationIds: [operationName]
			})
			.where(eq(generationJob.id, job.id));

		// Mark all queued images as generating and link to job
		const charImageIds = allItems
			.filter((i) => i.entityType === 'character')
			.map((i) => i.imageTableId);
		const locImageIds = allItems
			.filter((i) => i.entityType === 'location')
			.map((i) => i.imageTableId);
		const secImageIds = allItems
			.filter((i) => i.entityType === 'section')
			.map((i) => i.imageTableId);

		if (charImageIds.length > 0) {
			await db
				.update(characterImage)
				.set({ status: 'generating', generationJobId: job.id })
				.where(inArray(characterImage.id, charImageIds));
		}
		if (locImageIds.length > 0) {
			await db
				.update(locationImage)
				.set({ status: 'generating', generationJobId: job.id })
				.where(inArray(locationImage.id, locImageIds));
		}
		if (secImageIds.length > 0) {
			await db
				.update(sectionImage)
				.set({ status: 'generating', generationJobId: job.id })
				.where(inArray(sectionImage.id, secImageIds));
		}

		console.log(
			`[ref-image-queue] Submitted batch job ${job.id} with ${allItems.length} items, operation: ${operationName}`
		);
	} catch (err) {
		console.error('[ref-image-queue] Failed to submit batch:', err);

		await db
			.update(generationJob)
			.set({
				status: 'failed',
				errorLog: [{ error: (err as Error).message }]
			})
			.where(eq(generationJob.id, job.id));

		// Mark images back to queued so they get retried next cycle
		const charImageIds = allItems
			.filter((i) => i.entityType === 'character')
			.map((i) => i.imageTableId);
		const locImageIds = allItems
			.filter((i) => i.entityType === 'location')
			.map((i) => i.imageTableId);
		const secImageIds = allItems
			.filter((i) => i.entityType === 'section')
			.map((i) => i.imageTableId);

		if (charImageIds.length > 0) {
			await db
				.update(characterImage)
				.set({ status: 'queued' })
				.where(inArray(characterImage.id, charImageIds));
		}
		if (locImageIds.length > 0) {
			await db
				.update(locationImage)
				.set({ status: 'queued' })
				.where(inArray(locationImage.id, locImageIds));
		}
		if (secImageIds.length > 0) {
			await db
				.update(sectionImage)
				.set({ status: 'queued' })
				.where(inArray(sectionImage.id, secImageIds));
		}
	}
}
