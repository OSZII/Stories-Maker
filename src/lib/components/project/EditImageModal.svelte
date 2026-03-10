<script lang="ts">
	let {
		onsubmit
	}: {
		onsubmit: (
			entityType: 'character' | 'location',
			entityId: string,
			prompt: string,
			mode: 'fast' | 'batch'
		) => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let entityType = $state<'character' | 'location'>('character');
	let entityId = $state('');
	let entityName = $state('');
	let prompt = $state('');
	let mode = $state<'fast' | 'batch'>('fast');

	export function open(
		type: 'character' | 'location',
		id: string,
		name: string,
		m: 'fast' | 'batch'
	) {
		entityType = type;
		entityId = id;
		entityName = name;
		prompt = '';
		mode = m;
		dialog?.showModal();
	}

	function handleSubmit() {
		dialog?.close();
		onsubmit(entityType, entityId, prompt, mode);
	}
</script>

<dialog bind:this={dialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">Edit Image — {entityName}</h3>
		<p class="py-2 text-sm text-base-content/60">
			Describe what you want AI to change in the current image.
			{#if mode === 'fast'}
				This will generate immediately (2 credits).
			{:else}
				This will be added to the batch queue (1 credit).
			{/if}
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., Make the hair longer, change the outfit to a red dress, add a scar on the left cheek..."
			bind:value={prompt}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={handleSubmit} disabled={!prompt.trim()}>
				{mode === 'fast' ? 'Generate Now' : 'Add to Batch'}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
