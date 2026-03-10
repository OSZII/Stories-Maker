<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		getCharacterImageUrl,
		getCharImageHistoryUrl,
		getPrimaryImage,
		hasQueuedOrGenerating
	} from '$lib/utils/image-urls';

	let {
		character,
		projectId,
		isGeneratingImage,
		isInBatch,
		hasAiInput,
		submittingBatch,
		historyOpen,
		roles,
		onopenai,
		ongeneratefast,
		ontogbatch,
		onopenpreview,
		onopeneditimage,
		ontogglehistory
	}: {
		character: any;
		projectId: string;
		isGeneratingImage: boolean;
		isInBatch: boolean;
		hasAiInput: boolean;
		submittingBatch: boolean;
		historyOpen: boolean;
		roles: readonly string[];
		onopenai: () => void;
		ongeneratefast: () => void;
		ontogbatch: () => void;
		onopenpreview: (url: string) => void;
		onopeneditimage: (mode: 'fast' | 'batch') => void;
		ontogglehistory: () => void;
	} = $props();

	let primaryImg = $derived(character.images ? getPrimaryImage(character.images) : null);
	let hasQueued = $derived(character.images ? hasQueuedOrGenerating(character.images) : false);

	let showDeleteModal = $state(false);
	let deleteForm: HTMLFormElement | undefined = $state();

	// Inline editing state
	let editingField: 'name' | 'description' | 'imagePrompt' | null = $state(null);
	let editName = $state('');
	let editRole = $state('');
	let editDescription = $state('');
	let editImagePrompt = $state('');
	let updateForm: HTMLFormElement | undefined = $state();

	function startEdit(field: 'name' | 'description' | 'imagePrompt') {
		editingField = field;
		editName = character.name ?? '';
		editRole = character.role ?? '';
		editDescription = character.description ?? '';
		editImagePrompt = character.visualDescription ?? '';
	}

	function cancelEdit() {
		editingField = null;
	}

	function saveEdit() {
		updateForm?.requestSubmit();
		editingField = null;
	}
</script>

<!-- Hidden update form -->
<form bind:this={updateForm} method="post" action="?/updateCharacter" use:enhance class="hidden">
	<input type="hidden" name="characterId" value={character.id} />
	<input type="hidden" name="name" value={editingField === 'name' ? editName : character.name} />
	<input type="hidden" name="role" value={editingField === 'name' ? editRole : character.role} />
	<input
		type="hidden"
		name="description"
		value={editingField === 'description' ? editDescription : (character.description ?? '')}
	/>
	<input
		type="hidden"
		name="visualDescription"
		value={editingField === 'imagePrompt' ? editImagePrompt : (character.visualDescription ?? '')}
	/>
</form>

<div class="card overflow-hidden rounded-2xl border border-base-300/60 bg-base-200">
	<!-- Card body -->
	<div class="flex gap-0">
		<!-- Large portrait column -->
		<div class="relative w-100 shrink-0">
			{#if primaryImg}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="h-full min-h-72 cursor-pointer overflow-hidden"
					onclick={() => onopenpreview(getCharacterImageUrl(projectId, character))}
				>
					<img
						src={getCharacterImageUrl(projectId, character)}
						alt={character.name}
						class="h-full w-full object-cover"
					/>
				</div>
				<!-- Image overlay buttons -->
				<div
					class="absolute right-0 bottom-0 left-0 flex gap-1 bg-gradient-to-t from-black/60 to-transparent p-2"
				>
					<button
						class="btn flex-1 text-white/80 btn-ghost btn-xs hover:text-white"
						title="Edit image (fast, 2 credits)"
						onclick={() => onopeneditimage('fast')}
						disabled={true}>Edit</button
					>
					<button
						class="btn flex-1 text-white/80 btn-ghost btn-xs hover:text-white"
						title="Edit image (batch, 1 credit)"
						onclick={() => onopeneditimage('batch')}
						disabled={isGeneratingImage}>Batch</button
					>
				</div>
				{#if character.images && character.images.length > 1}
					<div class="absolute top-2 left-2">
						<button
							class="badge cursor-pointer badge-sm opacity-80 badge-neutral hover:opacity-100"
							onclick={ontogglehistory}
						>
							{character.images.length} versions
						</button>
					</div>
				{/if}
			{:else if isGeneratingImage}
				<div
					class="flex h-full min-h-72 flex-col items-center justify-center gap-3 bg-base-300/50 text-base-content/40"
				>
					<span class="loading loading-md loading-spinner"></span>
					<span class="text-xs">Generating…</span>
				</div>
			{:else if hasQueued}
				<div
					class="flex h-full min-h-72 flex-col items-center justify-center gap-3 bg-base-300/50 text-info/50"
				>
					<span class="loading loading-md loading-dots"></span>
					<span class="text-xs">Queued</span>
				</div>
			{:else}
				<div
					class="flex h-full min-h-72 flex-col items-center justify-center gap-3 bg-base-300/30 text-base-content/20"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="0.75"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
						/>
					</svg>
					<span class="text-xs tracking-wide">No image</span>
				</div>
			{/if}
		</div>

		<!-- Content column -->
		<div class="flex min-w-0 flex-1 flex-col gap-3 p-5">
			<!-- Name row -->
			<div class="flex items-start gap-2">
				{#if editingField === 'name'}
					<div class="flex flex-1 flex-wrap items-center gap-2">
						<input
							type="text"
							bind:value={editName}
							class="input-bordered input input-sm flex-1 text-xl font-bold"
							required
						/>
						<select bind:value={editRole} class="select-bordered select w-36 shrink-0 select-sm">
							{#each roles as r}
								<option value={r}>{r}</option>
							{/each}
						</select>
					</div>
					<button class="btn shrink-0 btn-xs btn-primary" onclick={saveEdit}>Save</button>
					<button class="btn shrink-0 btn-xs" onclick={cancelEdit}>Cancel</button>
				{:else}
					<div class="flex flex-1 flex-wrap items-center gap-2">
						<button
							onclick={() => startEdit('name')}
							class="btn text-2xl leading-tight font-bold btn-outline btn-secondary"
						>
							{character.name}
						</button>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<button
							onclick={() => startEdit('name')}
							class="text-bold btn btn-outline btn-xs btn-primary">{character.role}</button
						>
						{#if isInBatch}
							<span class="badge badge-info">queued</span>
						{/if}
					</div>
					<!-- Generate + Delete at top right -->
					<button
						class="btn shrink-0 btn-xs {hasAiInput ? 'btn-accent' : 'btn-primary'}"
						title="Configure AI description generation"
						onclick={onopenai}
					>
						Generate
					</button>
					<button
						class="btn shrink-0 text-error-content btn-xs btn-error"
						title="Delete character"
						onclick={() => (showDeleteModal = true)}
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
					<!-- Hidden delete form, submitted programmatically -->
					<form
						bind:this={deleteForm}
						method="post"
						action="?/deleteCharacter"
						use:enhance
						class="hidden"
					>
						<input type="hidden" name="characterId" value={character.id} />
					</form>
				{/if}
			</div>

			<!-- Description section -->
			<div class="rounded-lg border border-base-content/8 bg-base-content/3 px-3 py-2.5">
				<div class="mb-1.5 flex items-center justify-between">
					<p class="text-[10px] font-semibold tracking-widest text-base-content/35 uppercase">
						Description
					</p>
					<div class="flex gap-1">
						{#if editingField === 'description'}
							<button class="btn btn-xs btn-primary" onclick={saveEdit}>Save</button>
							<button class="btn btn-ghost btn-xs" onclick={cancelEdit}>Cancel</button>
						{:else}
							<button class="btn btn-xs btn-secondary" onclick={() => startEdit('description')}
								>Edit</button
							>
						{/if}
					</div>
				</div>
				{#if editingField === 'description'}
					<textarea
						bind:value={editDescription}
						class="textarea w-full resize-none textarea-ghost p-0 text-sm leading-relaxed focus:outline-none"
						placeholder="Describe the character…"
						rows="9"
					></textarea>
				{:else if character.description}
					<p class="h-[257px] max-h-[257px] text-sm leading-relaxed text-base-content/80">
						{character.description}
					</p>
				{:else}
					<p class="text-xs text-base-content/30 italic">No description yet.</p>
				{/if}
			</div>

			<!-- Image prompt section -->
			<div class="rounded-lg border border-base-content/8 bg-base-content/3 px-3 py-2.5">
				<div class="mb-1.5 flex items-center justify-between">
					<p class="text-[10px] font-semibold tracking-widest text-base-content/35 uppercase">
						Image Prompt
					</p>
					<div class="flex gap-1">
						{#if editingField === 'imagePrompt'}
							<button class="btn btn-xs btn-primary" onclick={saveEdit}>Save</button>
							<button class="btn btn-ghost btn-xs" onclick={cancelEdit}>Cancel</button>
						{:else}
							<button class="btn btn-xs btn-secondary" onclick={() => startEdit('imagePrompt')}
								>Edit</button
							>
						{/if}
						<button
							class="btn btn-xs btn-primary"
							title="Generate image (2 credits)"
							onclick={ongeneratefast}
							disabled={true}
						>
							{#if isGeneratingImage}<span class="loading loading-xs loading-spinner"></span>{/if}
							Fast
						</button>
						<button
							class="btn btn-outline btn-xs btn-primary"
							title="Add to batch (1 credit)"
							onclick={ontogbatch}
							disabled={submittingBatch}
						>
							{isInBatch ? 'Unqueue' : 'Batch'}
						</button>
					</div>
				</div>
				{#if editingField === 'imagePrompt'}
					<textarea
						bind:value={editImagePrompt}
						class="textarea w-full resize-none textarea-ghost p-0 text-xs leading-relaxed text-base-content/50 italic focus:outline-none"
						placeholder="Visual appearance, clothing, lighting…"
						rows="4"
					></textarea>
				{:else if character.visualDescription}
					<p class="text-xs leading-relaxed text-base-content/50 italic">
						{character.visualDescription}
					</p>
				{:else}
					<p class="text-xs text-base-content/30 italic">No image prompt yet.</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Image history panel -->
	{#if historyOpen && character.images && character.images.length > 1}
		<div class="flex flex-wrap gap-2 border-t border-base-300/60 bg-base-300/30 p-3">
			{#each character.images as img}
				{#if img.imageId && img.status === 'complete'}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="relative h-20 w-16 cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-100 hover:scale-105 {img.isPrimary
							? 'border-primary shadow-md'
							: 'border-base-content/10 hover:border-base-content/30'}"
						title="v{img.version}{img.prompt ? ` — ${img.prompt.substring(0, 80)}` : ''}"
						onclick={() =>
							onopenpreview(getCharImageHistoryUrl(projectId, character.id, img.imageId!))}
					>
						<img
							src={getCharImageHistoryUrl(projectId, character.id, img.imageId!)}
							alt="v{img.version}"
							class="h-full w-full object-cover"
						/>
						{#if img.isPrimary}
							<div class="absolute top-0 right-0">
								<span class="badge rounded-none rounded-bl badge-xs badge-primary">cur</span>
							</div>
						{/if}
					</div>
				{:else if img.status === 'queued' || img.status === 'generating'}
					<div
						class="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-info/30 text-info/50"
					>
						<span class="loading loading-xs loading-dots"></span>
						<span class="text-[8px]">{img.status}</span>
					</div>
				{:else if img.status === 'failed'}
					<div
						class="flex h-20 w-16 items-center justify-center rounded-lg border-2 border-dashed border-error/30 text-[8px] text-error/50"
					>
						Failed
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<!-- Delete confirmation modal -->
{#if showDeleteModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={() => (showDeleteModal = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="card w-full max-w-sm border border-base-300 bg-base-100 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="card-body gap-4">
				<div class="flex items-start gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error/15 text-error"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
							/>
						</svg>
					</div>
					<div>
						<h3 class="text-base font-semibold">Delete Character</h3>
						<p class="mt-1 text-sm text-base-content/65">
							Are you sure you want to delete <span class="font-medium text-base-content"
								>{character.name}</span
							>? This action cannot be undone.
						</p>
					</div>
				</div>
				<div class="flex justify-end gap-2">
					<button class="btn btn-ghost btn-sm" onclick={() => (showDeleteModal = false)}>
						Cancel
					</button>
					<button
						class="btn btn-sm btn-error"
						onclick={() => {
							showDeleteModal = false;
							deleteForm?.requestSubmit();
						}}
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
