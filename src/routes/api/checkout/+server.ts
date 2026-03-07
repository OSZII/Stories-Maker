import { json, error, redirect } from '@sveltejs/kit';
import { polarClient } from '$lib/server/polar';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'You must be logged in');
	}

	const { productId } = await request.json();
	if (!productId || typeof productId !== 'string') {
		throw error(400, 'Missing productId');
	}

	const checkout = await polarClient.checkouts.create({
		products: [productId],
		successUrl: `${env.ORIGIN}/checkout/success?checkout_id={CHECKOUT_ID}`,
		customerEmail: locals.user.email
	});

	return json({ url: checkout.url });
};
