/**
 * App layout server load — provides the authenticated user object to all
 * child routes. Returns null if not logged in (sidebar hides accordingly).
 */
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user
			? {
					id: locals.user.id,
					name: locals.user.name,
					email: locals.user.email,
					image: locals.user.image
				}
			: null
	};
};
