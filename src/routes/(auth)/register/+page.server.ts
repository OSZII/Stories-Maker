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
	signUp: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString();
		const email = formData.get('email')?.toString();
		const password = formData.get('password')?.toString();

		if (!name || !email || !password) {
			return fail(400, { message: 'All fields are required' });
		}

		if (password.length < 8) {
			return fail(400, { message: 'Password must be at least 8 characters' });
		}

		let result;
		try {
			result = await auth.api.signUpEmail({
				body: { name, email, password },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { message: 'Could not create account. Email may already be in use.' });
		}

		if (result?.error) {
			return fail(400, { message: 'Could not create account. Email may already be in use.' });
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
