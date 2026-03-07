import { Polar } from '@polar-sh/sdk';
import { env } from '$env/dynamic/private';

export const polarClient = new Polar({
	accessToken: env.POLAR_ACCESS_TOKEN,
	server: env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production'
});
