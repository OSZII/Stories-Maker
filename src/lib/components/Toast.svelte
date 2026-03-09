<!-- Toast notification overlay — renders active toasts in the top-right corner with auto-dismiss. -->
<script lang="ts">
	import { getToasts, removeToast } from '$lib/stores/toast.svelte';

	const toasts = $derived(getToasts());

	const alertClass: Record<string, string> = {
		info: 'alert-info',
		error: 'alert-error',
		success: 'alert-success',
		warning: 'alert-warning'
	};
</script>

{#if toasts.length > 0}
	<div class="toast toast-end toast-top z-50">
		{#each toasts as toast (toast.id)}
			<div class="alert {alertClass[toast.type]} max-w-sm shadow-lg">
				<div class="flex flex-col gap-1">
					<span class="text-sm">{toast.message}</span>
					{#if toast.link}
						<a href={toast.link.href} class="link text-xs font-medium link-hover">
							{toast.link.text}
						</a>
					{/if}
				</div>
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => removeToast(toast.id)}
					aria-label="Dismiss"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}
