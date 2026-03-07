import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { story, character, chapter, section } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-chapters] Starting chapter generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId } = await request.json();
	if (!storyId) throw error(400, 'Missing storyId');

	const project = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), eq(story.userId, locals.user.id), isNull(story.deletedAt))
	});
	if (!project) throw error(404, 'Story not found');
	if (!project.detailedStory) throw error(400, 'Story must be expanded first (Phase 2)');

	const characters = await db
		.select({
			name: character.name,
			role: character.role,
			description: character.description,
			visualDescription: character.visualDescription
		})
		.from(character)
		.where(and(eq(character.storyId, storyId), isNull(character.deletedAt)));

	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error('[generate-chapters] OPENROUTER_API_KEY not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const model = env.TEXT_MODEL;
	if (!model) {
		console.error('[generate-chapters] TEXT_MODEL not configured');
		throw error(500, 'Generation failed. Please try again later.');
	}

	const { sufficient } = await checkSufficientCredits(locals.user.id, 1);
	if (!sufficient) {
		throw error(402, 'NO_CREDITS');
	}
	await reserveCredits(locals.user.id, 1, 'text_gen');

	const systemPrompt = `You are a manga/manhwa panel scripter. Given a detailed story, break it into chapters and sections (panels). Output ONLY valid JSON array of chapters. Each chapter has:
- chapter_number: number
- title: string
- summary: string
- detailed_script: string (the full script for this chapter)
- sections: array of panel objects, each with:
  - section_number: number
  - narrative: string (what happens in this panel)
  - image_prompt: string (description for image generation: composition, camera angle, characters, action, mood, lighting)
  - panel_layout: "full" | "half" | "third" | "wide" | "tall"
  - dialogue: array of { character: string|null, text: string, type: "speech"|"thought"|"narration"|"sfx" }

Generate an appropriate number of chapters based on the story's complexity and length, with 6-12 sections each.`;

	const userPrompt = `Story: ${project.title}
Genre: ${project.genre || 'unspecified'}
Art Style: ${project.artStyle || 'manga'}

Detailed Story:
${project.detailedStory}

Characters:
${characters.map((c) => `- ${c.name} (${c.role}): ${c.visualDescription || c.description || 'No description'}`).join('\n')}

Break this story into chapters and detailed panel-by-panel sections.`;

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
		console.error('[generate-chapters] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const text = result.choices?.[0]?.message?.content;

	let chaptersData: Array<{
		chapter_number: number;
		title: string;
		summary: string;
		detailed_script: string;
		sections?: Array<{
			section_number: number;
			narrative: string;
			image_prompt: string;
			panel_layout: string;
		}>;
	}>;

	try {
		const parsed = JSON.parse(text);
		chaptersData = Array.isArray(parsed) ? parsed : parsed.chapters || [parsed];
	} catch {
		console.error('[generate-chapters] Failed to parse AI response:', text);
		throw error(502, 'Generation failed. Please try again later.');
	}

	// Delete existing chapters for this story (soft delete)
	const existingChapters = await db
		.select({ id: chapter.id })
		.from(chapter)
		.where(and(eq(chapter.storyId, storyId), isNull(chapter.deletedAt)));

	for (const ch of existingChapters) {
		await db.update(chapter).set({ deletedAt: new Date() }).where(eq(chapter.id, ch.id));
	}

	// Insert new chapters and sections
	for (const ch of chaptersData) {
		const [newChapter] = await db
			.insert(chapter)
			.values({
				storyId,
				chapterNumber: ch.chapter_number,
				title: ch.title,
				summary: ch.summary,
				detailedScript: ch.detailed_script,
				sectionCount: ch.sections?.length || 0,
				status: ch.detailed_script ? 'scripted' : 'draft',
				sortOrder: ch.chapter_number
			})
			.returning({ id: chapter.id });

		if (ch.sections && ch.sections.length > 0) {
			for (const sec of ch.sections) {
				await db.insert(section).values({
					chapterId: newChapter.id,
					sectionNumber: sec.section_number,
					narrative: sec.narrative,
					imagePrompt: sec.image_prompt,
					panelLayout: sec.panel_layout || 'full',
					status: sec.image_prompt ? 'prompt_ready' : 'draft',
					sortOrder: sec.section_number
				});
			}
		}
	}

	await db.update(story).set({ status: 'scripting' }).where(eq(story.id, storyId));

	const totalSections = chaptersData.reduce((sum, ch) => sum + (ch.sections?.length || 0), 0);
	console.log(`[generate-chapters] Completed: ${chaptersData.length} chapters, ${totalSections} sections`);
	return json({ success: true });
};
