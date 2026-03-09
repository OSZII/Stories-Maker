/**
 * Svelte 5 rune-based toast notification store.
 * Toasts auto-dismiss after 5s (8s for warnings). Supports optional link actions.
 */

type Toast = {
	id: string;
	message: string;
	type: 'info' | 'error' | 'success' | 'warning';
	link?: { text: string; href: string };
};

let toasts = $state<Toast[]>([]);

/** Get the reactive array of active toasts (consumed by the Toast component). */
export function getToasts() {
	return toasts;
}

/** Show a toast notification. Auto-removes after timeout (5s default, 8s for warnings). */
export function addToast(
	message: string,
	type: Toast['type'] = 'info',
	link?: { text: string; href: string }
) {
	const id = crypto.randomUUID();
	toasts.push({ id, message, type, link });

	const timeout = type === 'warning' ? 8000 : 5000;
	setTimeout(() => removeToast(id), timeout);
}

/** Dismiss a specific toast by ID. */
export function removeToast(id: string) {
	toasts = toasts.filter((t) => t.id !== id);
}
