/**
 * Assembles full image prompts for sections by combining:
 *   - Story style prefix
 *   - Section's base image prompt
 *   - Character visual descriptions (with emotions)
 *   - Location visual description
 * The assembled prompt is saved as `imagePromptFull` and the section marked `prompt_ready`.
 */
import { db } from '$lib/server/db';
import {
	story,
	chapter,
	section,
	sectionCharacter,
	character,
	location
} from '$lib/server/db/schema';
import { eq, and, isNull, isNotNull, inArray, asc } from 'drizzle-orm';

/**
 * For all sections in a story that have an imagePrompt, build a complete prompt
 * by appending style prefix, character visuals, and location description.
 * Returns the list of section IDs that were updated.
 */
export async function assembleImagePrompts(storyId: string) {
	const storyData = await db.query.story.findFirst({
		where: and(eq(story.id, storyId), isNull(story.deletedAt))
	});
	if (!storyData) throw new Error('Story not found');

	const chapters = await db
		.select({ id: chapter.id })
		.from(chapter)
		.where(and(eq(chapter.storyId, storyId), isNull(chapter.deletedAt)));

	if (chapters.length === 0) return [];

	const chapterIds = chapters.map((c) => c.id);

	const sections = await db
		.select()
		.from(section)
		.where(and(inArray(section.chapterId, chapterIds), isNotNull(section.imagePrompt)));

	if (sections.length === 0) return [];

	const sectionIds = sections.map((s) => s.id);

	// Load section-character associations with character data
	const sectionChars = await db
		.select({
			sectionId: sectionCharacter.sectionId,
			characterName: character.name,
			visualDescription: character.visualDescription,
			emotion: sectionCharacter.emotion
		})
		.from(sectionCharacter)
		.innerJoin(character, eq(sectionCharacter.characterId, character.id))
		.where(inArray(sectionCharacter.sectionId, sectionIds));

	// Load locations
	const locationIds = sections.map((s) => s.locationId).filter((id): id is string => id !== null);
	const locationsData =
		locationIds.length > 0
			? await db
					.select({
						id: location.id,
						name: location.name,
						visualDescription: location.visualDescription
					})
					.from(location)
					.where(inArray(location.id, locationIds))
			: [];

	const locationMap = new Map(locationsData.map((l) => [l.id, l]));
	const charsBySectionId = new Map<string, typeof sectionChars>();
	for (const sc of sectionChars) {
		const arr = charsBySectionId.get(sc.sectionId) || [];
		arr.push(sc);
		charsBySectionId.set(sc.sectionId, arr);
	}

	const updatedSectionIds: string[] = [];

	for (const sec of sections) {
		if (!sec.imagePrompt) continue;

		const parts: string[] = [];

		// Art style and medium
		if (storyData.stylePromptPrefix) {
			parts.push(`Art style and medium: ${storyData.stylePromptPrefix}`);
		}

		// Location / environment context first (establishes the world)
		if (sec.locationId) {
			const loc = locationMap.get(sec.locationId);
			if (loc?.visualDescription) {
				parts.push(`Environment: The scene takes place in ${loc.name}. ${loc.visualDescription}`);
			}
		}

		// Character visual references (so the model knows who's who before reading the scene)
		const chars = charsBySectionId.get(sec.id) || [];
		if (chars.length > 0) {
			const charDescriptions = chars
				.filter((c) => c.visualDescription)
				.map((c) => {
					let desc = `${c.characterName} — ${c.visualDescription}`;
					if (c.emotion) desc += `. Their expression in this scene: ${c.emotion}`;
					return desc;
				});
			if (charDescriptions.length > 0) {
				parts.push(
					`Character references:\n${charDescriptions.map((d) => `- ${d}`).join('\n')}`
				);
			}
		}

		// The core scene description last (the main visual instruction)
		parts.push(`Scene: ${sec.imagePrompt}`);

		const imagePromptFull = parts.join('\n\n');

		await db
			.update(section)
			.set({ imagePromptFull, status: 'prompt_ready' })
			.where(eq(section.id, sec.id));

		updatedSectionIds.push(sec.id);
	}

	return updatedSectionIds;
}
