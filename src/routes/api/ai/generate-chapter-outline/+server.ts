/**
 * POST /api/ai/generate-chapter-outline
 * Splits a story's detailed narrative into chapters with titles and summaries.
 * Uses OpenRouter LLM. Costs 1 text-gen credit.
 * Soft-deletes existing chapters and inserts new ones.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, chapter } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-chapter-outline] Starting chapter outline generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, userInput } = await request.json();
	if (!storyId) throw error(400, 'Missing storyId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');
	if (!project.detailedStory) throw error(400, 'Story must have a detailed overview first');

	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('[generate-chapter-outline] OPENROUTER_API_KEY not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const model = env.TEXT_MODEL;
	if (!model) {
		console.error('[generate-chapter-outline] TEXT_MODEL not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const systemPrompt = `You are a manga/manhwa story architect. Given a detailed story overview, split it into chapters. Return ONLY valid JSON with this structure:
{
  "chapters": [
    { "chapter_number": 1, "title": "string", "summary": "string (2-4 sentences summarizing what happens in this chapter)" }
  ]
}

Guidelines:
- Generate an appropriate number of chapters based on the story's complexity and length
- Each chapter should cover a meaningful story arc or sequence of events
- Summaries should be detailed enough to guide further expansion
- Ensure the chapters cover the entire story from beginning to end`;

	let userPrompt = `Story: ${project.title}
Genre: ${project.genre || 'unspecified'}

Detailed Story Overview:
${project.detailedStory}

Split this story into chapters with titles and summaries.`;

	if (userInput?.trim()) {
		userPrompt += `\n\nThe user specifically requested the following: ${userInput}`;
	}

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			temperature: 0.7,
			response_format: { type: 'json_object' }
		})
	});

	if (!response.ok) {
		const errBody = await response.text();
		console.error('[generate-chapter-outline] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const text = result.choices?.[0]?.message?.content;

	let chaptersData: Array<{
		chapter_number: number;
		title: string;
		summary: string;
	}>;

	try {
		const parsed = JSON.parse(text);
		chaptersData = Array.isArray(parsed) ? parsed : parsed.chapters || [parsed];
	} catch {
		console.error('[generate-chapter-outline] Failed to parse AI response:', text);
		throw error(502, 'Generation failed. Please try again later.');
	}

	// Soft-delete existing chapters
	const existingChapters = await db
		.select({ id: chapter.id })
		.from(chapter)
		.where(and(eq(chapter.storyId, storyId), isNull(chapter.deletedAt)));

	for (const ch of existingChapters) {
		await db.update(chapter).set({ deletedAt: new Date() }).where(eq(chapter.id, ch.id));
	}

	// Insert new chapters with only title + summary
	for (const ch of chaptersData) {
		await db.insert(chapter).values({
			storyId,
			chapterNumber: ch.chapter_number,
			title: ch.title,
			summary: ch.summary,
			status: 'draft',
			sortOrder: ch.chapter_number
		});
	}

	console.log(`[generate-chapter-outline] Completed: ${chaptersData.length} chapters`);
	return json({ success: true, chapterCount: chaptersData.length });
};
