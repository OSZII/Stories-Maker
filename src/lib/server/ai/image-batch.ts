/**
 * Batch image generation — queues section images for the cron job to process.
 *
 * Costs 1 credit per image (cheaper but slower — results arrive via polling).
 * Steps:
 *   1. Reserve credits upfront
 *   2. Load sections with assembled prompts
 *   3. Create sectionImage rows with status='queued' and prompt set
 *   4. The cron job (process-ref-image-queue) handles batch upload to Gemini
 */
import { db } from '$lib/server/db';
import { section, sectionImage } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { reserveCredits } from '$lib/server/credits';

const CREDITS_PER_IMAGE = 1;

/**
 * Queue section images for batch generation.
 * Creates sectionImage rows with status='queued' — the cron job picks them up.
 */
export async function startBatchGeneration(
	userId: string,
	storyId: string,
	sectionIds: string[]
): Promise<{ jobId: string }> {
	const totalCredits = sectionIds.length * CREDITS_PER_IMAGE;

	// Reserve credits upfront
	await reserveCredits(userId, totalCredits, 'image_gen');

	// Load sections with prompts
	const sections = await db.select().from(section).where(inArray(section.id, sectionIds));

	// Create sectionImage rows with status='queued'
	for (const sec of sections) {
		const prompt = sec.imagePromptFull || sec.imagePrompt;
		if (!prompt) continue;

		const existingImages = await db
			.select({ id: sectionImage.id })
			.from(sectionImage)
			.where(eq(sectionImage.sectionId, sec.id));

		await db.insert(sectionImage).values({
			sectionId: sec.id,
			status: 'queued',
			prompt,
			version: existingImages.length + 1,
			isSelected: existingImages.length === 0
		});
	}

	// Update sections to generating status
	await db.update(section).set({ status: 'generating' }).where(inArray(section.id, sectionIds));

	return { jobId: 'queued' };
}
