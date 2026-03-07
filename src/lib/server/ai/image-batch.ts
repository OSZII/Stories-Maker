import { db } from '$lib/server/db';
import { section, generationJob } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { reserveCredits } from '$lib/server/credits';

const CREDITS_PER_IMAGE = 1;

export async function startBatchGeneration(
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
			status: 'pending',
			totalItems: sectionIds.length,
			creditsReserved: totalCredits
		})
		.returning();

	// Load sections with prompts
	const sections = await db.select().from(section).where(inArray(section.id, sectionIds));

	// Build JSONL content
	const jsonlLines = sections.map((sec) => {
		const prompt = sec.imagePromptFull || sec.imagePrompt;
		return JSON.stringify({
			key: `section-${sec.id}`,
			request: {
				contents: [
					{
						role: 'user',
						parts: [{ text: `Generate a manga/manhwa panel image: ${prompt}` }]
					}
				],
				generationConfig: {
					responseModalities: ['TEXT', 'IMAGE']
				}
			}
		});
	});

	const jsonlContent = jsonlLines.join('\n');
	const jsonlBuffer = Buffer.from(jsonlContent, 'utf-8');

	const apiKey = env.GOOGLE_API_KEY;
	if (!apiKey) {
		console.error('[image-batch] GOOGLE_API_KEY not configured');
		throw new Error('GOOGLE_API_KEY not configured');
	}

	const imageModel = env.IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';

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
		console.error('[image-batch] File upload start failed:', errText);
		throw new Error('File upload start failed');
	}

	const uploadUrl = startUploadRes.headers.get('X-Goog-Upload-URL');
	if (!uploadUrl) {
		console.error('[image-batch] No upload URL in response');
		throw new Error('No upload URL in response');
	}

	// Step 2: Upload the JSONL content
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
		console.error('[image-batch] File upload failed:', errText);
		throw new Error('File upload failed');
	}

	const uploadResult = await uploadRes.json();
	const fileUri = uploadResult.file?.uri;
	if (!fileUri) {
		console.error('[image-batch] No file URI in upload response');
		throw new Error('No file URI in upload response');
	}

	// Strip to files/<name> format (after /v1beta/)
	const fileRef = fileUri.includes('/v1beta/') ? fileUri.split('/v1beta/')[1] : fileUri;

	// Step 3: Create batch job
	const batchRes = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:batchGenerateContent?key=${apiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				requests: {
					file: fileRef
				}
			})
		}
	);

	if (!batchRes.ok) {
		const errText = await batchRes.text();
		console.error('[image-batch] Batch job creation failed:', errText);
		throw new Error('Batch job creation failed');
	}

	const batchResult = await batchRes.json();
	const operationName = batchResult.name;
	if (!operationName) {
		console.error('[image-batch] No operation name in batch response');
		throw new Error('No operation name in batch response');
	}

	// Store operation name and update status
	await db
		.update(generationJob)
		.set({
			status: 'submitted',
			googleOperationIds: [operationName]
		})
		.where(eq(generationJob.id, job.id));

	// Update sections to generating status
	await db.update(section).set({ status: 'generating' }).where(inArray(section.id, sectionIds));

	return { jobId: job.id };
}
