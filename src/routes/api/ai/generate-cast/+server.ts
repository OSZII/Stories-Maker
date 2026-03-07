import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, character, location } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-cast] Starting cast generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, userInput } = await request.json();
	if (!storyId) throw error(400, 'Missing storyId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	if (!project.synopsis?.trim()) throw error(400, 'Synopsis is required to generate cast');

	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('[generate-cast] OPENROUTER_API_KEY not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const model = env.TEXT_MODEL;
	if (!model) {
		console.error('[generate-cast] TEXT_MODEL not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	// Fetch existing characters and locations to avoid duplicates
	const existingCharacters = await db.query.character.findMany({
		where: and(eq(character.storyId, storyId), isNull(character.deletedAt)),
		columns: { name: true, role: true, description: true }
	});
	const existingLocations = await db.query.location.findMany({
		where: and(eq(location.storyId, storyId), isNull(location.deletedAt)),
		columns: { name: true, description: true }
	});

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const hasExisting = existingCharacters.length > 0 || existingLocations.length > 0;

	const systemPrompt = `You are a professional manga/manhwa story designer. Given a story title, genre, and synopsis, generate a cast of characters and key locations. Return ONLY valid JSON with no markdown formatting, no code fences, no extra text. The JSON must match this exact structure:
{
  "characters": [
    { "name": "string", "role": "main|supporting|antagonist|side", "description": "string", "visual_description": "string", "image_prompt": "string" }
  ],
  "locations": [
    { "name": "string", "description": "string", "visual_description": "string", "image_prompt": "string" }
  ]
}

Guidelines:
- Generate 3-8 characters depending on story complexity
- ${hasExisting ? 'Do NOT recreate or duplicate any existing characters or locations listed below' : 'Always include at least 1 main character and 1 antagonist'}
- Include a mix of roles: main, supporting, antagonist, side
- Generate 2-5 locations relevant to the story
- Descriptions should be 1-2 sentences, focusing on personality/role for characters and atmosphere/purpose for locations
- visual_description: Detailed appearance (hair color/style, eye color, build, height, clothing, distinguishing features) for characters; visual details (architecture, colors, atmosphere, lighting) for locations
- image_prompt: A prompt for generating a reference image. For characters include "character reference sheet, multiple angles, full body, manga style". For locations include "environment concept art, manga style"
- Names should fit the genre (Japanese for manga, Korean for manhwa, etc.)`;

	let userPrompt = `Title: ${project.title}
Genre: ${project.genre || 'Not specified'}
Synopsis: ${project.synopsis}`;

	if (existingCharacters.length > 0) {
		userPrompt += `\n\nExisting characters (DO NOT duplicate these):\n${existingCharacters.map((c) => `- ${c.name} (${c.role}): ${c.description || 'No description'}`).join('\n')}`;
	}
	if (existingLocations.length > 0) {
		userPrompt += `\n\nExisting locations (DO NOT duplicate these):\n${existingLocations.map((l) => `- ${l.name}: ${l.description || 'No description'}`).join('\n')}`;
	}

	if (userInput?.trim()) {
		userPrompt += `\n\nThe user specifically requested the following: ${userInput}`;
	}

	userPrompt += `\n\nGenerate the characters and locations for this story.`;

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
			temperature: 0.9,
			response_format: { type: 'json_object' }
		})
	});

	if (!response.ok) {
		const errBody = await response.text();
		console.error('[generate-cast] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const text = result.choices?.[0]?.message?.content;
	if (!text) {
		console.error('[generate-cast] AI returned empty response');
		throw error(502, 'Generation failed. Please try again later.');
	}

	let generated: {
		characters: { name: string; role: string; description: string; visual_description?: string; image_prompt?: string }[];
		locations: { name: string; description: string; visual_description?: string; image_prompt?: string }[];
	};

	try {
		generated = JSON.parse(text);
	} catch {
		console.error('[generate-cast] Failed to parse AI response:', text);
		throw error(502, 'Generation failed. Please try again later.');
	}

	// Insert characters
	if (generated.characters?.length) {
		const validRoles = ['main', 'supporting', 'antagonist', 'side'];
		const startCharOrder = existingCharacters.length;
		await db.insert(character).values(
			generated.characters.map((c, i) => ({
				storyId,
				name: c.name,
				role: validRoles.includes(c.role) ? c.role : 'supporting',
				description: c.description || null,
				visualDescription: c.visual_description || null,
				imagePrompt: c.image_prompt || null,
				sortOrder: startCharOrder + i
			}))
		);
	}

	// Insert locations
	if (generated.locations?.length) {
		const startLocOrder = existingLocations.length;
		await db.insert(location).values(
			generated.locations.map((l, i) => ({
				storyId,
				name: l.name,
				description: l.description || null,
				visualDescription: l.visual_description || null,
				imagePrompt: l.image_prompt || null,
				sortOrder: startLocOrder + i
			}))
		);
	}

	console.log(`[generate-cast] Completed: ${generated.characters?.length ?? 0} characters, ${generated.locations?.length ?? 0} locations`);
	return json({
		success: true,
		characterCount: generated.characters?.length ?? 0,
		locationCount: generated.locations?.length ?? 0
	});
};
