/**
 * Signup page server logic.
 * Load: redirects already-authenticated users to /dashboard.
 * Actions:
 *   - signInGoogle: initiate Google OAuth flow via Better Auth
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, '/dashboard');
	}
	return {};
};

export const actions: Actions = {
	signInGoogle: async (event) => {
		const result = await auth.api.signInSocial({
			body: {
				provider: 'google',
				callbackURL: '/'
			},
			headers: event.request.headers
		});

		if (result.url) {
			return redirect(302, result.url);
		}
		return fail(400, { message: 'Google sign-in failed' });
	}
};
