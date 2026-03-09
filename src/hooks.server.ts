/**
 * Server hooks — runs on every request.
 * Sets up cron jobs (when not in build mode) and chains two SvelteKit handle middlewares:
 *   1. Paraglide i18n (locale detection, HTML lang/dir replacement)
 *   2. Better Auth (session hydration + auth route handling)
 */

import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import cron from 'node-cron';
import { pollPendingJobs } from '$lib/server/jobs/poll-generations';
import { processRefImageQueue } from '$lib/server/jobs/process-ref-image-queue';

// Schedule background cron jobs only at runtime (not during `npm run build`)
// if (!building) {
// Every minute: poll Google Batch API for completed image generation operations
// cron.schedule(
// 	'* * * * *',
// 	async () => {
// 		console.log('[cron] pollPendingJobs — starting');
// 		try {
// 			await pollPendingJobs();
// 			console.log('[cron] pollPendingJobs — done');
// 		} catch (err) {
// 			console.error('[cron] pollPendingJobs — error:', err);
// 		}
// 	},
// 	{
// 		// @ts-ignore
// 		scheduled: true,
// 		timezone: 'UTC',
// 		recoverMissedExecutions: false
// 	}
// );

// Every 15 minutes: collect queued reference image rows and submit them as a batch to Google
// cron.schedule(
// 	'*/15 * * * *',
// 	async () => {
// 		console.log('[cron] processRefImageQueue — starting');
// 		try {
// 			await processRefImageQueue();
// 			console.log('[cron] processRefImageQueue — done');
// 		} catch (err) {
// 			console.error('[cron] processRefImageQueue — error:', err);
// 		}
// 	},
// 	{
// 		// @ts-ignore
// 		scheduled: true,
// 		timezone: 'UTC',
// 		recoverMissedExecutions: false
// 	}
// );

console.log('Scheduled job polling every minute + ref image queue every 15 minutes');
// }

/**
 * Paraglide middleware — detects the visitor's locale from the URL,
 * injects the correct `lang` and `dir` attributes into the HTML shell.
 */
const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

/**
 * Better Auth middleware — reads the session cookie from the request,
 * populates `event.locals.user` and `event.locals.session` if authenticated,
 * then delegates to Better Auth's SvelteKit handler for auth API routes.
 */
const handleBetterAuth: Handle = async ({ event, resolve }) => {
	// await processRefImageQueue();
	// await processRefImageQueue();
	await pollPendingJobs();
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/** Compose both handles in order: i18n first, then auth. */
export const handle: Handle = sequence(handleParaglide, handleBetterAuth);
