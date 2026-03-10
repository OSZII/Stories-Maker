<script lang="ts">
	let {
		title,
		description,
		placeholder = 'Add optional instructions...',
		submitLabel = 'Generate',
		submitting = false,
		onsubmit
	}: {
		title: string;
		description: string;
		placeholder?: string;
		submitLabel?: string;
		submitting?: boolean;
		onsubmit: (input: string) => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let inputValue = $state('');

	export function open(initialValue?: string) {
		inputValue = initialValue ?? '';
		dialog?.showModal();
	}

	function handleSubmit() {
		dialog?.close();
		onsubmit(inputValue);
	}
</script>

<dialog bind:this={dialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">{title}</h3>
		<p class="py-2 text-sm text-base-content/60">
			{description}
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			{placeholder}
			bind:value={inputValue}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={handleSubmit} disabled={submitting}>
				{#if submitting}
					<span class="loading loading-xs loading-spinner"></span>
					Generating...
				{:else}
					{submitLabel}
				{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
