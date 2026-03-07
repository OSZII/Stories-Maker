import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, chapter } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-chapter-detail] Starting chapter detail generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, chapterId } = await request.json();
	if (!storyId || !chapterId) throw error(400, 'Missing storyId or chapterId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');
	if (!project.detailedStory) throw error(400, 'Story must have a detailed overview first');

	const ch = await db.query.chapter.findFirst({
		where: and(eq(chapter.id, chapterId), eq(chapter.storyId, storyId), isNull(chapter.deletedAt))
	});
	if (!ch) throw error(404, 'Chapter not found');

	console.log(`[generate-chapter-detail] Chapter ${ch.chapterNumber}: ${ch.title}`);

	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('[generate-chapter-detail] OPENROUTER_API_KEY not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const model = env.TEXT_MODEL;
	if (!model) {
		console.error('[generate-chapter-detail] TEXT_MODEL not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const systemPrompt = `You are a professional manga/manhwa scriptwriter. Given a story overview and a chapter summary, write the full detailed script for this chapter. Include scene descriptions, character actions, emotions, dialogue cues, and visual notes. Write in clear, descriptive prose that can be broken into manga panels later.`;

	const userPrompt = `Story: ${project.title}
Genre: ${project.genre || 'unspecified'}
Art Style: ${project.artStyle || 'manga'}

Story Overview:
${project.detailedStory}

Chapter ${ch.chapterNumber}: ${ch.title}
Summary: ${ch.summary}

Write the full detailed script for this chapter. Include vivid scene descriptions, character interactions, emotional beats, and visual details suitable for manga adaptation.`;

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
			temperature: 0.8
		})
	});

	if (!response.ok) {
		const errBody = await response.text();
		console.error('[generate-chapter-detail] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const detailedScript = result.choices?.[0]?.message?.content || '';

	await db
		.update(chapter)
		.set({ detailedScript, status: 'scripted' })
		.where(eq(chapter.id, chapterId));

	console.log(`[generate-chapter-detail] Completed chapter ${ch.chapterNumber}, ${detailedScript.length} chars`);
	return json({ success: true });
};
