/**
 * POST /api/ai/generate-chapter-sections
 * Breaks a chapter's detailed script into 8-16 manga panel sections.
 * Each section gets a narrative, image prompt, panel layout, section type,
 * dialogue, and character associations.
 * Uses OpenRouter LLM. Costs 1 text-gen credit.
 * Hard-deletes existing sections for the chapter and inserts new ones.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	story,
	character,
	chapter,
	section,
	sectionDialogue,
	sectionCharacter
} from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { checkSufficientCredits, reserveCredits } from '$lib/server/credits';

const VALID_SECTION_TYPES = [
	'action',
	'dialogue',
	'establishing',
	'transition',
	'reaction',
	'splash',
	'montage'
] as const;

const VALID_PANEL_LAYOUTS = ['full', 'half', 'third', 'wide', 'tall'] as const;

const VALID_DIALOGUE_TYPES = [
	'speech',
	'thought',
	'narration',
	'sfx',
	'whisper',
	'shout'
] as const;

type SectionData = {
	section_number: number;
	narrative: string;
	image_prompt: string;
	panel_layout: string;
	section_type: string;
	characters: Array<{ name: string; emotion?: string }>;
	dialogue: Array<{
		character: string | null;
		text: string;
		type: string;
		position_hint?: string;
	}>;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	console.log('[generate-chapter-sections] Starting section generation');
	if (!locals.user) throw error(401, 'Not authenticated');

	const { storyId, chapterId, userInput } = await request.json();
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
			id: character.id,
			name: character.name,
			role: character.role,
			visualDescription: character.visualDescription,
			description: character.description
		})
		.from(character)
		.where(and(eq(character.storyId, storyId), isNull(character.deletedAt)));

	// Build character name -> id map for resolving AI references
	const characterMap = new Map<string, string>();
	for (const c of characters) {
		characterMap.set(c.name.toLowerCase(), c.id);
	}

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

	const systemPrompt = `You are a manga/manhwa panel scripter and visual storytelling expert. Given a chapter script and character details, break the chapter into 8-16 panel sections with varied pacing. Output ONLY valid JSON with this structure:
{
  "sections": [
    {
      "section_number": 1,
      "section_type": "establishing" | "action" | "dialogue" | "transition" | "reaction" | "splash" | "montage",
      "narrative": "string (what happens in this panel)",
      "image_prompt": "string (see image prompt rules below)",
      "panel_layout": "full" | "half" | "third" | "wide" | "tall",
      "characters": [
        { "name": "exact character name", "emotion": "optional emotion" }
      ],
      "dialogue": [
        { "character": "exact character name or null", "text": "string", "type": "speech"|"thought"|"narration"|"sfx"|"whisper"|"shout", "position_hint": "top|middle|bottom" }
      ]
    }
  ]
}

## SECTION TYPES — use a variety for dynamic pacing:

**establishing** — Wide/panoramic shot introducing a new location or scene. Sets atmosphere and context. Use at the START of each new scene or location change. No dialogue except optional narration. Image prompt should emphasize environment, architecture, sky, mood. Panel layout: usually "wide" or "full".

**transition** — Visual bridge between scenes. Shows passage of time, travel, or emotional shift. Examples: sunset sky, footsteps in snow, clock face, train window view. Minimal or no dialogue (narration only). Image prompt should be atmospheric and symbolic. Panel layout: "wide" or "half".

**action** — Dynamic movement, combat, chase, physical conflict. Captures a specific moment of motion. Image prompt should convey kinetic energy, motion blur, impact. Panel layout: varies ("full" for big moments, "half"/"third" for rapid sequences).

**dialogue** — Character conversation, verbal confrontation, planning. Focus on character expressions and body language. Image prompt should show characters in conversation poses with clear emotions. Panel layout: "half" or "third" for back-and-forth exchanges.

**reaction** — Close-up on a character's emotional response to something just shown. Follows a dramatic reveal, shocking news, or important action. Image prompt should be a close-up or extreme close-up of face/eyes showing specific emotion. Panel layout: "half" or "third".

**splash** — Full dramatic impact panel for the most pivotal moments. Use SPARINGLY (max 1-2 per chapter). Big reveals, transformation moments, emotional climaxes. Image prompt should be highly detailed and cinematic. Panel layout: always "full".

**montage** — Multiple small moments compressed into one panel. Training sequences, daily routines, memory flashes. Image prompt should describe the dominant/representative moment. Panel layout: "full" or "wide".

## PACING RULES (critical):
1. START each new scene/location with an "establishing" shot
2. After a dramatic action or revelation, include a "reaction" panel
3. Use "transition" panels between distinct scene changes
4. Don't make every panel "dialogue" or "action" — vary the rhythm
5. Place "splash" panels at the chapter's emotional peak (1-2 max)
6. Alternate between wide/calm panels and tight/intense panels
7. A typical chapter flow: establishing → dialogue → action → reaction → transition → establishing → dialogue → splash → reaction

## DIALOGUE RULES:
- "establishing" and "transition" panels should have narration ONLY (no character speech)
- Keep dialogue lines SHORT (under 15 words each) — this is manga, not a novel
- Use character's EXACT name from the character list (case-sensitive)
- Use "narration" type for scene-setting text boxes (character should be null)
- Use "sfx" for sound effects (character should be null)
- "reaction" panels can have 0-1 short lines (gasps, exclamations)

## IMAGE PROMPT RULES (critical for quality):
Write each image_prompt as a richly descriptive scene paragraph, NOT a keyword list. Follow these rules:

1. DESCRIBE THE SCENE NARRATIVELY: Write flowing sentences that paint a vivid picture. Bad: "girl, sword, forest, dramatic". Good: "A young warrior stands at the edge of a dark pine forest, gripping a glowing katana in her right hand as wind sweeps her long silver hair across her face."

2. SPECIFY CAMERA AND COMPOSITION: State the shot type and angle explicitly. Use terms like: extreme close-up, close-up, medium shot, full-body shot, wide establishing shot, bird's-eye view, low-angle looking up, over-the-shoulder, Dutch angle, dramatic worm's-eye perspective.

3. DESCRIBE LIGHTING AND ATMOSPHERE: Include specific lighting conditions and mood. Examples: "harsh overhead fluorescent light casting sharp shadows", "warm golden-hour sunlight filtering through leaves", "a single streetlamp creating a pool of light in the surrounding darkness".

4. LAYER FOREGROUND, MIDGROUND, BACKGROUND: For complex scenes, describe spatial depth step by step. Example: "In the foreground, shattered glass fragments float in mid-air. In the midground, two figures face each other across a cracked marble floor. The background reveals a crumbling cathedral ceiling open to a stormy sky."

5. INCLUDE ACTION AND MOTION: Describe the exact moment of action. Bad: "character fighting". Good: "Mid-swing, her blade arcs downward trailing a streak of blue energy, her body twisted at the waist with her back foot pushing off the ground."

6. CONVEY EMOTION THROUGH VISUAL CUES: Don't just name emotions — describe the facial expression, body language, and environmental cues that convey them. Bad: "character looks sad". Good: "Her eyes are half-lidded and glistening, lips pressed into a thin line, shoulders slumped as rain streaks down her cheeks."

7. NEVER include text, speech bubbles, or dialogue in the image_prompt — those go in the dialogue array only.

## TYPE-SPECIFIC IMAGE PROMPT NOTES:
- **establishing**: Wide angle, emphasize environment scale, architecture, weather, time of day. Characters small or absent.
- **transition**: Symbolic/atmospheric — focus on objects, scenery, weather changes. Abstract or metaphorical visuals welcome.
- **action**: Dynamic angles (low/Dutch), motion lines implied through pose, mid-action freeze frame. High energy composition.
- **dialogue**: Medium shots or over-the-shoulder. Focus on facial expressions and body language. Background can be softer/blurred.
- **reaction**: Extreme close-up or close-up. Eyes, mouth, hands. Dramatic lighting shifts. Minimal background.
- **splash**: Cinematic wide or dramatic low angle. Maximum visual detail. This is the "poster moment".
- **montage**: Choose the most visually striking moment to depict. Describe it as a single clear image.`;

	let userPrompt = `Story: ${project.title}
Genre: ${project.genre || 'unspecified'}
Art Style: ${project.artStyle || 'manga'}

Characters:
${characters.map((c) => `- ${c.name} (${c.role}): ${c.visualDescription || c.description || 'No description'}`).join('\n')}

Chapter ${ch.chapterNumber}: ${ch.title}
Detailed Script:
${ch.detailedScript}

Break this chapter into 8-16 panel sections for manga adaptation. Use varied section types for dynamic pacing. Remember to start scenes with establishing shots and follow dramatic moments with reaction panels.`;

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
		console.error('[generate-chapter-sections] OpenRouter API error:', errBody);
		throw error(502, 'Generation failed. Please try again later.');
	}

	const result = await response.json();
	const text = result.choices?.[0]?.message?.content;

	let sectionsData: SectionData[];

	try {
		const parsed = JSON.parse(text);
		sectionsData = Array.isArray(parsed) ? parsed : parsed.sections || [parsed];
	} catch {
		console.error('[generate-chapter-sections] Failed to parse AI response:', text);
		throw error(502, 'Generation failed. Please try again later.');
	}

	// Normalize and validate section data
	for (const sec of sectionsData) {
		// Default missing fields
		sec.section_type = sec.section_type || 'action';
		sec.characters = sec.characters || [];
		sec.dialogue = sec.dialogue || [];

		// Validate section_type
		if (!VALID_SECTION_TYPES.includes(sec.section_type as (typeof VALID_SECTION_TYPES)[number])) {
			sec.section_type = 'action';
		}

		// Validate panel_layout
		if (!VALID_PANEL_LAYOUTS.includes(sec.panel_layout as (typeof VALID_PANEL_LAYOUTS)[number])) {
			sec.panel_layout = 'full';
		}

		// Validate dialogue types
		for (const d of sec.dialogue) {
			if (!VALID_DIALOGUE_TYPES.includes(d.type as (typeof VALID_DIALOGUE_TYPES)[number])) {
				d.type = 'speech';
			}
		}
	}

	// Hard-delete existing sections for this chapter (cascade deletes dialogue & character associations)
	const existingSections = await db
		.select({ id: section.id })
		.from(section)
		.where(eq(section.chapterId, chapterId));

	for (const sec of existingSections) {
		await db.delete(section).where(eq(section.id, sec.id));
	}

	// Insert new sections with dialogue and character associations
	for (const sec of sectionsData) {
		const [inserted] = await db
			.insert(section)
			.values({
				chapterId,
				sectionNumber: sec.section_number,
				narrative: sec.narrative,
				imagePrompt: sec.image_prompt,
				panelLayout: sec.panel_layout || 'full',
				sectionType: sec.section_type || 'action',
				status: sec.image_prompt ? 'prompt_ready' : 'draft',
				sortOrder: sec.section_number
			})
			.returning({ id: section.id });

		const sectionId = inserted.id;

		// Insert dialogue rows
		if (sec.dialogue.length > 0) {
			for (let i = 0; i < sec.dialogue.length; i++) {
				const d = sec.dialogue[i];
				const charId = d.character ? characterMap.get(d.character.toLowerCase()) ?? null : null;

				await db.insert(sectionDialogue).values({
					sectionId,
					characterId: charId,
					text: d.text,
					type: d.type || 'speech',
					positionHint: d.position_hint ?? null,
					sortOrder: i
				});
			}
		}

		// Collect unique character IDs from both characters array and dialogue
		const charIds = new Set<string>();

		for (const c of sec.characters) {
			const id = characterMap.get(c.name.toLowerCase());
			if (id) charIds.add(id);
		}

		for (const d of sec.dialogue) {
			if (d.character) {
				const id = characterMap.get(d.character.toLowerCase());
				if (id) charIds.add(id);
			}
		}

		// Insert section-character associations
		for (const charId of charIds) {
			const charEntry = sec.characters.find(
				(c) => characterMap.get(c.name.toLowerCase()) === charId
			);

			await db.insert(sectionCharacter).values({
				sectionId,
				characterId: charId,
				emotion: charEntry?.emotion ?? null
			});
		}
	}

	// Update chapter section count
	await db
		.update(chapter)
		.set({ sectionCount: sectionsData.length })
		.where(eq(chapter.id, chapterId));

	console.log(
		`[generate-chapter-sections] Completed: ${sectionsData.length} sections for chapter ${ch.chapterNumber}`
	);
	return json({ success: true, sectionCount: sectionsData.length });
};
