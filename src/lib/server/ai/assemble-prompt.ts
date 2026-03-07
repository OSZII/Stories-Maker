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

		// Style prefix from story
		if (storyData.stylePromptPrefix) {
			parts.push(storyData.stylePromptPrefix);
		}

		// The section's own image prompt
		parts.push(sec.imagePrompt);

		// Character visual descriptions
		const chars = charsBySectionId.get(sec.id) || [];
		if (chars.length > 0) {
			const charDescriptions = chars
				.filter((c) => c.visualDescription)
				.map((c) => {
					let desc = `${c.characterName}: ${c.visualDescription}`;
					if (c.emotion) desc += ` (expression: ${c.emotion})`;
					return desc;
				});
			if (charDescriptions.length > 0) {
				parts.push('Characters in scene: ' + charDescriptions.join('. '));
			}
		}

		// Location visual description
		if (sec.locationId) {
			const loc = locationMap.get(sec.locationId);
			if (loc?.visualDescription) {
				parts.push(`Setting: ${loc.name} - ${loc.visualDescription}`);
			}
		}

		const imagePromptFull = parts.join('\n\n');

		await db
			.update(section)
			.set({ imagePromptFull, status: 'prompt_ready' })
			.where(eq(section.id, sec.id));

		updatedSectionIds.push(sec.id);
	}

	return updatedSectionIds;
}
