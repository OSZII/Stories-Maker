/**
 * Server-side Better Auth configuration.
 * Sets up email+password and Google OAuth providers, Drizzle DB adapter,
 * and the Polar.sh billing plugin (checkout, portal, usage tracking, webhooks).
 */
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { checkout, polar, portal, usage, webhooks } from '@polar-sh/better-auth';
import { polarClient } from '$lib/server/polar';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID!,
			clientSecret: env.GOOGLE_CLIENT_SECRET!
		}
	},
	plugins: [
		polar({
			client: polarClient,
			createCustomerOnSignUp: true,
			use: [
				checkout({
					products: [
						// TODO: Add your Polar product IDs and slugs
						// { productId: "your-product-id", slug: "pro" }
					],
					successUrl: '/checkout/success?checkout_id={CHECKOUT_ID}',
					authenticatedUsersOnly: true
				}),
				portal(),
				usage(),
				webhooks({
					secret: env.POLAR_WEBHOOK_SECRET!,
					onCustomerStateChanged: async (_payload) => {
						// TODO: Handle customer state changes (e.g., update credits, feature flags)
					},
					onOrderPaid: async (_payload) => {
						// TODO: Handle paid orders (e.g., grant credits)
					}
				})
			]
		}),
		sveltekitCookies(getRequestEvent) // must be the last plugin
	]
});
