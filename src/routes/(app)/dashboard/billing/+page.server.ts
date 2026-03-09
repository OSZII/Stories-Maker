/**
 * Billing page server load — fetches the user's credit balances
 * and plan name for display on the billing management page.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserCredits } from '$lib/server/get-user-credits';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/signup');

	const credits = await getUserCredits(locals.user.id);

	return { credits };
};
