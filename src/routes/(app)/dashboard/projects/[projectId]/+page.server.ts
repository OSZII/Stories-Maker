import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { story, character, location, chapter, section, generationJob } from '$lib/server/db/schema';
import { eq, isNull, and, asc, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const project = await db.query.story.findFirst({
		where: and(
			eq(story.id, params.projectId),
			eq(story.userId, locals.user!.id),
			isNull(story.deletedAt)
		)
	});

	if (!project) throw error(404, 'Project not found');

	const characters = await db
		.select()
		.from(character)
		.where(and(eq(character.storyId, project.id), isNull(character.deletedAt)))
		.orderBy(asc(character.sortOrder));

	const locations = await db
		.select()
		.from(location)
		.where(and(eq(location.storyId, project.id), isNull(location.deletedAt)))
		.orderBy(asc(location.sortOrder));

	const chapters = await db.query.chapter.findMany({
		where: and(eq(chapter.storyId, project.id), isNull(chapter.deletedAt)),
		orderBy: asc(chapter.sortOrder),
		with: {
			sections: {
				orderBy: asc(section.sortOrder),
				with: {
					images: true
				}
			}
		}
	});

	// Load active generation jobs for this story
	const activeJobs = await db
		.select()
		.from(generationJob)
		.where(
			and(
				eq(generationJob.storyId, project.id),
				sql`${generationJob.status} IN ('pending', 'submitted', 'processing')`
			)
		)
		.orderBy(desc(generationJob.createdAt))
		.limit(1);

	const activeJob = activeJobs[0] || null;

	return { project, characters, locations, chapters, activeJob };
};

export const actions: Actions = {
	updateStory: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const title = formData.get('title')?.toString();
		const genre = formData.get('genre')?.toString();
		const artStyle = formData.get('artStyle')?.toString();
		const synopsis = formData.get('synopsis')?.toString();
		if (!title?.trim()) return fail(400, { message: 'Title is required' });

		await db
			.update(story)
			.set({
				title: title.trim(),
				genre: genre?.trim() || null,
				artStyle: artStyle?.trim() || null,
				synopsis: synopsis?.trim() || null
			})
			.where(and(eq(story.id, params.projectId), eq(story.userId, locals.user!.id)));

		return { success: true, action: 'updateStory' };
	},

	addCharacter: async ({ request, params }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString();
		const role = formData.get('role')?.toString() || 'supporting';
		const description = formData.get('description')?.toString();

		if (!name?.trim()) return fail(400, { message: 'Character name is required' });

		await db.insert(character).values({
			storyId: params.projectId,
			name: name.trim(),
			role,
			description: description?.trim() || null
		});

		return { success: true, action: 'addCharacter' };
	},

	updateCharacter: async ({ request }) => {
		const formData = await request.formData();
		const characterId = formData.get('characterId')?.toString();
		const name = formData.get('name')?.toString();
		const role = formData.get('role')?.toString();
		const description = formData.get('description')?.toString();
		const visualDescription = formData.get('visualDescription')?.toString();

		if (!characterId || !name?.trim())
			return fail(400, { message: 'Character ID and name required' });

		await db
			.update(character)
			.set({
				name: name.trim(),
				role: role || 'supporting',
				description: description?.trim() || null,
				visualDescription: visualDescription?.trim() || null
			})
			.where(eq(character.id, characterId));

		return { success: true, action: 'updateCharacter' };
	},

	deleteCharacter: async ({ request }) => {
		const formData = await request.formData();
		const characterId = formData.get('characterId')?.toString();
		if (!characterId) return fail(400, { message: 'Character ID required' });

		await db.update(character).set({ deletedAt: new Date() }).where(eq(character.id, characterId));

		return { success: true, action: 'deleteCharacter' };
	},

	addLocation: async ({ request, params }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString();
		const description = formData.get('description')?.toString();

		if (!name?.trim()) return fail(400, { message: 'Location name is required' });

		await db.insert(location).values({
			storyId: params.projectId,
			name: name.trim(),
			description: description?.trim() || null
		});

		return { success: true, action: 'addLocation' };
	},

	updateLocation: async ({ request }) => {
		const formData = await request.formData();
		const locationId = formData.get('locationId')?.toString();
		const name = formData.get('name')?.toString();
		const description = formData.get('description')?.toString();
		const visualDescription = formData.get('visualDescription')?.toString();

		if (!locationId || !name?.trim())
			return fail(400, { message: 'Location ID and name required' });

		await db
			.update(location)
			.set({
				name: name.trim(),
				description: description?.trim() || null,
				visualDescription: visualDescription?.trim() || null
			})
			.where(eq(location.id, locationId));

		return { success: true, action: 'updateLocation' };
	},

	deleteLocation: async ({ request }) => {
		const formData = await request.formData();
		const locationId = formData.get('locationId')?.toString();
		if (!locationId) return fail(400, { message: 'Location ID required' });

		await db.update(location).set({ deletedAt: new Date() }).where(eq(location.id, locationId));

		return { success: true, action: 'deleteLocation' };
	},

	updateDetailedStory: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const detailedStory = formData.get('detailedStory')?.toString();

		await db
			.update(story)
			.set({
				detailedStory: detailedStory?.trim() || null,
				status: detailedStory?.trim() ? 'refining' : 'draft'
			})
			.where(and(eq(story.id, params.projectId), eq(story.userId, locals.user!.id)));

		return { success: true, action: 'updateDetailedStory' };
	},

	updateChapter: async ({ request }) => {
		const formData = await request.formData();
		const chapterId = formData.get('chapterId')?.toString();
		const title = formData.get('title')?.toString();
		const summary = formData.get('summary')?.toString();
		const detailedScript = formData.get('detailedScript')?.toString();

		if (!chapterId) return fail(400, { message: 'Chapter ID required' });

		await db
			.update(chapter)
			.set({
				title: title?.trim() || null,
				summary: summary?.trim() || null,
				detailedScript: detailedScript?.trim() || null,
				status: detailedScript?.trim() ? 'scripted' : 'draft'
			})
			.where(eq(chapter.id, chapterId));

		return { success: true, action: 'updateChapter' };
	}
};
