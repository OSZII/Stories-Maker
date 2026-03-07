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
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString();
		const password = formData.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { message: 'Email and password are required' });
		}

		let result;
		try {
			result = await auth.api.signInEmail({
				body: { email, password },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { message: 'Invalid email or password' });
		}

		if (result.error) {
			return fail(400, { message: 'Invalid email or password' });
		}

		return redirect(302, '/dashboard');
	},

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
