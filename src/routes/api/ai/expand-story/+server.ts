import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, character, location } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[expand-story] Starting story expansion');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, userInput } = await request.json();
	if (!storyId) throw error(400, 'Missing storyId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	const characters = await db
		.select({ name: character.name, role: character.role, description: character.description })
		.from(character)
		.where(and(eq(character.storyId, storyId), isNull(character.deletedAt)));

	const locations = await db
		.select({ name: location.name, description: location.description })
		.from(location)
		.where(and(eq(location.storyId, storyId), isNull(location.deletedAt)));

	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('[expand-story] OPENROUTER_API_KEY not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const model = env.TEXT_MODEL;
	if (!model) {
		console.error('[expand-story] TEXT_MODEL not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const systemPrompt = `You are a professional manhwa/manga scriptwriter. Given a synopsis, genre, characters, and locations, expand the story into a detailed continuous narrative. Write a rich, complete story overview covering character arcs, plot twists, pacing, key scenes, and emotional beats. Do NOT break the story into chapters — write it as one continuous narrative that flows naturally. Write in clear, structured prose.`;

	let userPrompt = `Title: ${project.title}
Genre: ${project.genre || 'Not specified'}
Art Style: ${project.artStyle || 'Not specified'}

Synopsis:
${project.synopsis || 'No synopsis provided'}

Characters:
${characters.map((c) => `- ${c.name} (${c.role}): ${c.description || 'No description'}`).join('\n')}

Locations:
${locations.length > 0 ? locations.map((l) => `- ${l.name}: ${l.description || 'No description'}`).join('\n') : 'None specified'}`;

	if (project.detailedStory?.trim()) {
		userPrompt += `\n\nCurrent Story Overview (use as a base to improve upon):\n${project.detailedStory}`;
	}

	if (userInput?.trim()) {
		userPrompt += `\n\nThe user specifically requested the following changes/instructions: ${userInput}`;
	}

	userPrompt += `\n\nPlease expand this into a detailed, continuous story narrative. Cover the complete story arc from beginning to end, including all major scenes, character development, conflicts, and resolution. Do NOT split into chapters.`;

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
		console.error('[expand-story] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const detailedStory = result.choices?.[0]?.message?.content || 'AI failed to generate content.';

	await db.update(story).set({ detailedStory, status: 'refining' }).where(eq(story.id, storyId));

	console.log(`[expand-story] Completed, ${detailedStory.length} chars`);
	return json({ success: true });
};
