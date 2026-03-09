/**
 * Projects list page.
 * Load: fetches all non-deleted stories for the user, ordered by last updated.
 * Actions:
 *   - create: inserts a new "Untitled Project" story and redirects to its editor.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { story } from '$lib/server/db/schema';
import { eq, isNull, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/signup');

	const stories = await db
		.select({
			id: story.id,
			title: story.title,
			genre: story.genre,
			status: story.status,
			createdAt: story.createdAt,
			updatedAt: story.updatedAt
		})
		.from(story)
		.where(and(eq(story.userId, locals.user!.id), isNull(story.deletedAt)))
		.orderBy(desc(story.updatedAt));

	return { stories };
};

export const actions: Actions = {
	create: async ({ locals }) => {
		const [newStory] = await db
			.insert(story)
			.values({
				userId: locals.user!.id,
				title: 'Untitled Project'
			})
			.returning({ id: story.id });

		throw redirect(302, `/dashboard/projects/${newStory.id}`);
	}
};
