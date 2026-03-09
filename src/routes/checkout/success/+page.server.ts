/**
 * Checkout success page server load.
 * After Polar redirects the user back, fetches the checkout details
 * to display the product name on the confirmation screen.
 */
import { error, redirect } from '@sveltejs/kit';
import { polarClient } from '$lib/server/polar';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(302, '/signup');
	}

	const checkoutId = url.searchParams.get('checkout_id');
	if (!checkoutId) {
		throw error(400, 'Missing checkout ID');
	}

	const checkout = await polarClient.checkouts.get({ id: checkoutId });

	return {
		userName: locals.user.name,
		productName: checkout.product.name
	};
};
