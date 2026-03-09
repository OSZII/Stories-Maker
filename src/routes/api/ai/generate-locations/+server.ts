/**
 * POST /api/ai/generate-locations
 * Generates new story locations using OpenRouter LLM based on the synopsis
 * and existing characters/locations. Avoids duplicates. Costs 1 text-gen credit.
 * Inserts new location rows with descriptions, visual descriptions, and image prompts.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, character, location } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-locations] Starting location generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, userInput } = await request.json();
	if (!storyId) throw error(400, 'Missing storyId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	if (!project.synopsis?.trim()) throw error(400, 'Synopsis is required to generate locations');

	const apiKey = env.OPENROUTER_API_KEY;
	const model = env.TEXT_MODEL;
	if (!apiKey || !model) throw error(500, 'Generation failed. Please try again later.');

	// Fetch existing data for context
	const existingCharacters = await db.query.character.findMany({
		where: and(eq(character.storyId, storyId), isNull(character.deletedAt)),
		columns: { name: true, role: true, description: true }
	});
	const existingLocations = await db.query.location.findMany({
		where: and(eq(location.storyId, storyId), isNull(location.deletedAt)),
		columns: { name: true, description: true }
	});

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) throw error(402, 'NO_CREDITS');
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const systemPrompt = `You are a location designer for manga/manhwa. Generate new locations for a story. Return ONLY valid JSON with no markdown formatting, no code fences, no extra text. The JSON must match this exact structure:
{
  "locations": [
    { "name": "string", "description": "string", "visual_description": "string", "image_prompt": "string" }
  ]
}

Guidelines:
- Generate 1-5 new locations relevant to the story
- Do NOT recreate or duplicate any existing locations listed below
- description: 1-2 sentences about the location's atmosphere and purpose in the story
- visual_description: Detailed visual details (architecture, colors, atmosphere, lighting, style)
- image_prompt: A prompt for generating environment concept art, include "environment concept art, manga style"
- Names should fit the genre (Japanese for manga, Korean for manhwa, etc.)`;

	let userPrompt = `Title: ${project.title}
Genre: ${project.genre || 'Not specified'}
Synopsis: ${project.synopsis}`;

	if (existingCharacters.length > 0) {
		userPrompt += `\n\nExisting characters (for context):\n${existingCharacters.map((c) => `- ${c.name} (${c.role}): ${c.description || 'No description'}`).join('\n')}`;
	}

	if (existingLocations.length > 0) {
		userPrompt += `\n\nExisting locations (DO NOT duplicate these):\n${existingLocations.map((l) => `- ${l.name}: ${l.description || 'No description'}`).join('\n')}`;
	}

	if (userInput?.trim()) {
		userPrompt += `\n\nThe user specifically requested the following: ${userInput}`;
	}

	userPrompt += `\n\nGenerate new locations for this story.`;

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
		console.error('[generate-locations] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const text = result.choices?.[0]?.message?.content;
	if (!text) throw error(502, 'Generation failed. Please try again later.');

	let generated: {
		locations: { name: string; description: string; visual_description?: string; image_prompt?: string }[];
	};

	try {
		generated = JSON.parse(text);
	} catch {
		console.error('[generate-locations] Failed to parse AI response:', text);
		throw error(502, 'Generation failed. Please try again later.');
	}

	if (generated.locations?.length) {
		const startOrder = existingLocations.length;
		await db.insert(location).values(
			generated.locations.map((l, i) => ({
				storyId,
				name: l.name,
				description: l.description || null,
				visualDescription: l.visual_description || null,
				imagePrompt: l.image_prompt || null,
				sortOrder: startOrder + i
			}))
		);
	}

	console.log(`[generate-locations] Completed: ${generated.locations?.length ?? 0} locations`);
	return json({
		success: true,
		locationCount: generated.locations?.length ?? 0
	});
};
