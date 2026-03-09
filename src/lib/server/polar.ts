/**
 * Polar.sh SDK client — used for creating checkouts, listing products,
 * and managing customer billing. Reads access token and environment
 * (sandbox vs production) from env vars.
 */
import { Polar } from '@polar-sh/sdk';
import { env } from '$env/dynamic/private';

export const polarClient = new Polar({
	accessToken: env.POLAR_ACCESS_TOKEN,
	server: env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production'
});
