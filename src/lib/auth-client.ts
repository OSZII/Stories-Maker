/**
 * Client-side Better Auth instance — used in Svelte components for
 * sign-in, sign-out, and Polar billing portal interactions.
 */
import { createAuthClient } from 'better-auth/svelte';
import { polarClient } from '@polar-sh/better-auth/client';

export const authClient = createAuthClient({
	plugins: [polarClient()]
});
