<script lang="ts">
	let dialog = $state<HTMLDialogElement | null>(null);
	let currentUrl = $state<string | null>(null);

	export function open(url: string) {
		currentUrl = null;
		queueMicrotask(() => {
			currentUrl = url;
			dialog?.showModal();
		});
	}
</script>

<dialog bind:this={dialog} class="modal">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-box max-w-5xl p-2" onclick={() => dialog?.close()}>
		{#if currentUrl}
			<img src={currentUrl} alt="Preview" class="max-h-[85vh] w-full rounded object-contain" />
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
