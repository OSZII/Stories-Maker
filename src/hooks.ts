/**
 * Client-side reroute hook — strips the locale prefix from URLs
 * so SvelteKit routes are matched without the /en/, /fr/, etc. segment.
 */
import { deLocalizeUrl } from '$lib/paraglide/runtime';

export const reroute = (request) => deLocalizeUrl(request.url).pathname;
