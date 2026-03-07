import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, character } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-character] Starting character generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, characterId, userInput } = await request.json();
	if (!storyId || !characterId) throw error(400, 'Missing storyId or characterId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	const char = await db.query.character.findFirst({
		where: and(eq(character.id, characterId), eq(character.storyId, storyId))
	});
	if (!char) throw error(404, 'Character not found');
	console.log(`[generate-character] Character: ${char.name}`);

	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('[generate-character] OPENROUTER_API_KEY not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const model = env.TEXT_MODEL;
	if (!model) {
		console.error('[generate-character] TEXT_MODEL not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const systemPrompt = `You are a character designer for manga/manhwa. Generate detailed visual descriptions for characters. Output ONLY valid JSON with these fields:
- description: A paragraph about the character's personality, background, and role
- visual_description: Detailed appearance (hair color/style, eye color, build, height, clothing, distinguishing features)
- image_prompt: A prompt for generating a character reference sheet (include "character reference sheet, multiple angles, full body, manga style")`;

	let userPrompt = `Story: ${project.title} (${project.genre || 'unspecified genre'})
Character: ${char.name}
Role: ${char.role}
Existing description: ${char.description || 'None'}
Story context: ${project.synopsis || project.detailedStory || 'No context available'}

Generate detailed descriptions for this character.`;

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
		console.error('[generate-character] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const text = result.choices?.[0]?.message?.content;

	let parsed: { description?: string; visual_description?: string; image_prompt?: string };
	try {
		parsed = JSON.parse(text);
	} catch {
		console.error('[generate-character] Failed to parse AI response:', text);
		throw error(502, 'Generation failed. Please try again later.');
	}

	await db
		.update(character)
		.set({
			description: parsed.description || char.description,
			visualDescription: parsed.visual_description || char.visualDescription,
			imagePrompt: parsed.image_prompt || char.imagePrompt
		})
		.where(eq(character.id, characterId));

	console.log(`[generate-character] Completed: ${char.name}`);
	return json({ success: true });
};
