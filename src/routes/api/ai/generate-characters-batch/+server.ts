import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, character } from '$lib/server/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-characters-batch] Starting batch character generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, characters: charRequests } = await request.json();
	if (!storyId || !charRequests?.length) throw error(400, 'Missing storyId or characters');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	const apiKey = env.OPENROUTER_API_KEY;
	const model = env.TEXT_MODEL;
	if (!apiKey || !model) throw error(500, 'Generation failed. Please try again later.');

	const charIds = charRequests.map((c: { characterId: string }) => c.characterId);
	const chars = await db.query.character.findMany({
		where: and(inArray(character.id, charIds), eq(character.storyId, storyId), isNull(character.deletedAt))
	});

	if (chars.length === 0) throw error(404, 'No valid characters found');
	console.log(`[generate-characters-batch] Batch size: ${chars.length}`);

	const creditsNeeded = chars.length;
	const { sufficient } = await checkSufficientCredits(locals.user.id, creditsNeeded);
	if (!sufficient) throw error(402, 'NO_CREDITS');
	await reserveCredits(locals.user.id, creditsNeeded, 'text_gen');

	const inputMap = new Map<string, string>();
	for (const req of charRequests) {
		if (req.userInput?.trim()) {
			inputMap.set(req.characterId, req.userInput);
		}
	}

	const systemPrompt = `You are a character designer for manga/manhwa. Generate detailed visual descriptions for characters. Output ONLY valid JSON with these fields:
- description: A paragraph about the character's personality, background, and role
- visual_description: Detailed appearance (hair color/style, eye color, build, height, clothing, distinguishing features)
- image_prompt: A prompt for generating a character reference sheet (include "character reference sheet, multiple angles, full body, manga style")`;

	const results: { characterId: string; success: boolean }[] = [];

	for (const char of chars) {
		try {
			let userPrompt = `Story: ${project.title} (${project.genre || 'unspecified genre'})
Character: ${char.name}
Role: ${char.role}
Existing description: ${char.description || 'None'}
Story context: ${project.synopsis || project.detailedStory || 'No context available'}

Generate detailed descriptions for this character.`;

			const userInput = inputMap.get(char.id);
			if (userInput) {
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
				results.push({ characterId: char.id, success: false });
				continue;
			}

			const result = await response.json();
			const text = result.choices?.[0]?.message?.content;

			const parsed: { description?: string; visual_description?: string; image_prompt?: string } =
				JSON.parse(text);

			await db
				.update(character)
				.set({
					description: parsed.description || char.description,
					visualDescription: parsed.visual_description || char.visualDescription,
					imagePrompt: parsed.image_prompt || char.imagePrompt
				})
				.where(eq(character.id, char.id));

			console.log(`[generate-characters-batch] Completed: ${char.name}`);
			results.push({ characterId: char.id, success: true });
		} catch {
			console.log(`[generate-characters-batch] Failed: ${char.name}`);
			results.push({ characterId: char.id, success: false });
		}
	}

	const successCount = results.filter((r) => r.success).length;
	const failCount = results.filter((r) => !r.success).length;
	console.log(`[generate-characters-batch] Done: ${successCount} success, ${failCount} failed`);
	return json({ success: true, results });
};
