type Toast = {
	id: string;
	message: string;
	type: 'info' | 'error' | 'success' | 'warning';
	link?: { text: string; href: string };
};

let toasts = $state<Toast[]>([]);

export function getToasts() {
	return toasts;
}

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

export function removeToast(id: string) {
	toasts = toasts.filter((t) => t.id !== id);
}
