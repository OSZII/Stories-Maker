import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, character, chapter, section } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-chapter-sections] Starting section generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, chapterId } = await request.json();
	if (!storyId || !chapterId) throw error(400, 'Missing storyId or chapterId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');

	const ch = await db.query.chapter.findFirst({
		where: and(eq(chapter.id, chapterId), eq(chapter.storyId, storyId), isNull(chapter.deletedAt))
	});
	if (!ch) throw error(404, 'Chapter not found');
	if (!ch.detailedScript) throw error(400, 'Chapter must have a detailed script first');

	console.log(`[generate-chapter-sections] Chapter ${ch.chapterNumber}: ${ch.title}`);

	const characters = await db
		.select({
			name: character.name,
			role: character.role,
			visualDescription: character.visualDescription,
			description: character.description
		})
		.from(character)
		.where(and(eq(character.storyId, storyId), isNull(character.deletedAt)));

	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('[generate-chapter-sections] OPENROUTER_API_KEY not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const model = env.TEXT_MODEL;
	if (!model) {
		console.error('[generate-chapter-sections] TEXT_MODEL not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const systemPrompt = `You are a manga/manhwa panel scripter. Given a chapter script and character details, break the chapter into 6-12 panel sections. Output ONLY valid JSON with this structure:
{
  "sections": [
    {
      "section_number": 1,
      "narrative": "string (what happens in this panel)",
      "image_prompt": "string (description for image generation: composition, camera angle, characters, action, mood, lighting)",
      "panel_layout": "full" | "half" | "third" | "wide" | "tall",
      "dialogue": [
        { "character": "string|null", "text": "string", "type": "speech"|"thought"|"narration"|"sfx" }
      ]
    }
  ]
}

Guidelines:
- Generate 6-12 sections per chapter
- Each section should represent a single visual moment/panel
- image_prompt should be detailed enough for AI image generation
- Include character visual descriptions in image prompts when characters appear
- Vary panel_layout for visual interest`;

	const userPrompt = `Story: ${project.title}
Genre: ${project.genre || 'unspecified'}
Art Style: ${project.artStyle || 'manga'}

Characters:
${characters.map((c) => `- ${c.name} (${c.role}): ${c.visualDescription || c.description || 'No description'}`).join('\n')}

Chapter ${ch.chapterNumber}: ${ch.title}
Detailed Script:
${ch.detailedScript}

Break this chapter into panel-by-panel sections for manga adaptation.`;

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
		console.error('[generate-chapter-sections] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const text = result.choices?.[0]?.message?.content;

	let sectionsData: Array<{
		section_number: number;
		narrative: string;
		image_prompt: string;
		panel_layout: string;
	}>;

	try {
		const parsed = JSON.parse(text);
		sectionsData = Array.isArray(parsed) ? parsed : parsed.sections || [parsed];
	} catch {
		console.error('[generate-chapter-sections] Failed to parse AI response:', text);
		throw error(502, 'Generation failed. Please try again later.');
	}

	// Hard-delete existing sections for this chapter (section table has no deletedAt)
	const existingSections = await db
		.select({ id: section.id })
		.from(section)
		.where(eq(section.chapterId, chapterId));

	for (const sec of existingSections) {
		await db.delete(section).where(eq(section.id, sec.id));
	}

	// Insert new sections
	for (const sec of sectionsData) {
		await db.insert(section).values({
			chapterId,
			sectionNumber: sec.section_number,
			narrative: sec.narrative,
			imagePrompt: sec.image_prompt,
			panelLayout: sec.panel_layout || 'full',
			status: sec.image_prompt ? 'prompt_ready' : 'draft',
			sortOrder: sec.section_number
		});
	}

	// Update chapter section count
	await db
		.update(chapter)
		.set({ sectionCount: sectionsData.length })
		.where(eq(chapter.id, chapterId));

	console.log(`[generate-chapter-sections] Completed: ${sectionsData.length} sections for chapter ${ch.chapterNumber}`);
	return json({ success: true, sectionCount: sectionsData.length });
};
