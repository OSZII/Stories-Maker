import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserCredits } from '$lib/server/get-user-credits';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const credits = await getUserCredits(locals.user.id);

	return { credits };
};
