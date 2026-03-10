<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { addToast } from '$lib/stores/toast.svelte';
	import StoryDetailsCard from './StoryDetailsCard.svelte';
	import CharacterCard from './CharacterCard.svelte';
	import LocationCard from './LocationCard.svelte';
	import AiInstructionModal from './AiInstructionModal.svelte';
	import EditImageModal from './EditImageModal.svelte';

	let {
		project,
		characters,
		locations,
		projectId,
		phase1Complete,
		ongotostep,
		onopenpreview
	}: {
		project: any;
		characters: any[];
		locations: any[];
		projectId: string;
		phase1Complete: boolean;
		ongotostep: (step: string) => void;
		onopenpreview: (url: string) => void;
	} = $props();

	const roles = ['main', 'supporting', 'antagonist', 'side'] as const;
	const genres = [
		'Action',
		'Romance',
		'Fantasy',
		'Sci-Fi',
		'Horror',
		'Comedy',
		'Drama',
		'Thriller',
		'Mystery',
		'Slice of Life',
		'Isekai',
		'Mecha'
	];
	const artStyles = [
		'Manga (B&W)',
		'Manhwa (Full Color)',
		'Webtoon',
		'Dark Fantasy',
		'Shojo',
		'Shonen',
		'Seinen',
		'Chibi',
		'Realistic',
		'Watercolor'
	];

	// Local state
	let showAddCharacter = $state(false);
	let showAddLocation = $state(false);
	let characterAiInputs = $state<Record<string, string>>({});
	let generatingCharDescs = $state(false);
	let generatingCast = $state(false);
	let generatingLocations = $state(false);
	let generatingRefImage = $state<Record<string, boolean>>({});
	let refImageBatchQueue = $state<
		Array<{ entityType: 'character' | 'location'; entityId: string; editPrompt?: string }>
	>([]);
	let submittingRefBatch = $state(false);
	let charImageHistoryId = $state<string | null>(null);
	let locImageHistoryId = $state<string | null>(null);

	// Per-character AI modal
	let activeCharModalId = $state<string | null>(null);
	let activeCharModalName = $state('');
	let charModalInput = $state('');
	let charAiDialog = $state<HTMLDialogElement | null>(null);

	let selectedCharCount = $derived(Object.keys(characterAiInputs).length);

	// Modal refs
	let castModal: AiInstructionModal;
	let locationsModal: AiInstructionModal;
	let editImageModal: EditImageModal;

	function isInRefBatch(entityType: 'character' | 'location', entityId: string) {
		return refImageBatchQueue.some((i) => i.entityType === entityType && i.entityId === entityId);
	}

	function addToRefBatch(entityType: 'character' | 'location', entityId: string) {
		if (isInRefBatch(entityType, entityId)) return;
		refImageBatchQueue = [...refImageBatchQueue, { entityType, entityId }];
	}

	function removeFromRefBatch(entityType: 'character' | 'location', entityId: string) {
		refImageBatchQueue = refImageBatchQueue.filter(
			(i) => !(i.entityType === entityType && i.entityId === entityId)
		);
	}

	async function generateRefImageFast(
		entityType: 'character' | 'location',
		entityId: string,
		editPrompt?: string
	) {
		const key = `${entityType}-${entityId}`;
		generatingRefImage = { ...generatingRefImage, [key]: true };
		try {
			const res = await fetch('/api/ai/generate-reference-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: projectId, entityType, entityId, mode: 'fast', editPrompt })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate image', 'error');
				}
				return;
			}
			await invalidateAll();
			addToast('Image generated!', 'success');
		} finally {
			const { [key]: _, ...rest } = generatingRefImage;
			generatingRefImage = rest;
		}
	}

	async function submitRefBatch() {
		if (refImageBatchQueue.length === 0) return;
		submittingRefBatch = true;
		try {
			const res = await fetch('/api/ai/generate-reference-images-batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: projectId, items: refImageBatchQueue })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to queue batch generation', 'error');
				}
				return;
			}
			const result = await res.json();
			refImageBatchQueue = [];
			await invalidateAll();
			addToast(`${result.queued} image(s) queued for batch processing`, 'success');
		} catch {
			addToast('Failed to queue batch generation', 'error');
		} finally {
			submittingRefBatch = false;
		}
	}

	async function generateCast(userInput?: string) {
		generatingCast = true;
		try {
			const res = await fetch('/api/ai/generate-cast', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: projectId, userInput: userInput || undefined })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate characters & locations. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			generatingCast = false;
		}
	}

	async function generateSelectedCharacters() {
		generatingCharDescs = true;
		try {
			const chars = Object.entries(characterAiInputs).map(([characterId, userInput]) => ({
				characterId,
				userInput: userInput || undefined
			}));
			const res = await fetch('/api/ai/generate-characters-batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: projectId, characters: chars })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate character descriptions. Please try again later.', 'error');
				}
				return;
			}
			characterAiInputs = {};
			await invalidateAll();
		} finally {
			generatingCharDescs = false;
		}
	}

	async function generateLocationsAi(userInput?: string) {
		generatingLocations = true;
		try {
			const res = await fetch('/api/ai/generate-locations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: projectId, userInput: userInput || undefined })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate locations. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			generatingLocations = false;
		}
	}

	function openCharAiModal(charId: string, charName: string) {
		activeCharModalId = charId;
		activeCharModalName = charName;
		charModalInput = characterAiInputs[charId] ?? '';
		charAiDialog?.showModal();
	}

	function saveCharAiModal() {
		if (activeCharModalId) {
			characterAiInputs = { ...characterAiInputs, [activeCharModalId]: charModalInput };
		}
		charAiDialog?.close();
	}

	function handleEditImageSubmit(
		entityType: 'character' | 'location',
		entityId: string,
		prompt: string,
		mode: 'fast' | 'batch'
	) {
		if (mode === 'fast') {
			generateRefImageFast(entityType, entityId, prompt);
		} else {
			refImageBatchQueue = [
				...refImageBatchQueue.filter(
					(i) => !(i.entityType === entityType && i.entityId === entityId)
				),
				{ entityType, entityId, editPrompt: prompt }
			];
		}
	}
</script>

<div class="space-y-6">
	<StoryDetailsCard {project} {genres} {artStyles} />

	<!-- Generate Characters & Locations -->
	{#if characters.length === 0 && locations.length === 0}
		<div class="card border border-dashed border-base-300 bg-base-200">
			<div class="card-body items-center py-8 text-center">
				<h2 class="card-title text-lg">Auto-Generate Cast & Locations</h2>
				<p class="max-w-md text-sm text-base-content/50">
					Let AI create characters and locations based on your title, genre, and synopsis. You can
					edit them afterwards.
				</p>
				<button
					class="btn mt-3 gap-2 btn-sm btn-secondary"
					onclick={() => castModal.open()}
					disabled={generatingCast || !project.synopsis?.trim()}
				>
					{#if generatingCast}
						<span class="loading loading-sm loading-spinner"></span>
						Generating...
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
							/>
						</svg>
						Generate with AI
					{/if}
				</button>
				{#if !project.synopsis?.trim()}
					<p class="mt-1 text-xs text-warning">Add a synopsis first</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Characters -->
	<div class="card border border-base-300 bg-base-200">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<h2 class="card-title text-lg">
					Characters <span class="badge badge-sm">{characters.length}</span>
				</h2>
				<div class="flex gap-2">
					{#if characters.length > 0}
						<button
							class="btn gap-1 btn-sm btn-primary"
							onclick={() => castModal.open()}
							disabled={generatingCast || !project.synopsis?.trim()}
							title="Generate more characters & locations with AI"
						>
							{#if generatingCast}
								<span class="loading loading-xs loading-spinner"></span>
							{/if}
							AI Generate
						</button>
					{/if}
					<button
						class="btn btn-outline btn-sm btn-accent"
						onclick={() => (showAddCharacter = !showAddCharacter)}
					>
						{showAddCharacter ? 'Cancel' : 'Add Character'}
					</button>
				</div>
			</div>

			{#if showAddCharacter}
				<form
					method="post"
					action="?/addCharacter"
					use:enhance={() =>
						async ({ update }) => {
							showAddCharacter = false;
							await update();
						}}
					class="mt-4 space-y-3 rounded-lg bg-base-300 p-4"
				>
					<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
						<input
							type="text"
							name="name"
							placeholder="Character name"
							class="input-bordered input input-sm w-full"
							required
						/>
						<select name="role" class="select-bordered select w-full select-sm">
							{#each roles as r}
								<option value={r}>{r}</option>
							{/each}
						</select>
					</div>
					<textarea
						name="description"
						placeholder="Brief description..."
						class="textarea-bordered textarea w-full textarea-sm"
					></textarea>
					<button class="btn btn-sm btn-primary">Add</button>
				</form>
			{/if}

			{#if characters.length > 0}
				<div class="mt-2 flex flex-col gap-4">
					{#each characters as char}
						<CharacterCard
							character={char}
							{projectId}
							isGeneratingImage={!!generatingRefImage[`character-${char.id}`]}
							isInBatch={isInRefBatch('character', char.id)}
							hasAiInput={char.id in characterAiInputs}
							submittingBatch={submittingRefBatch}
							historyOpen={charImageHistoryId === char.id}
							{roles}
							onopenai={() => openCharAiModal(char.id, char.name)}
							ongeneratefast={() => generateRefImageFast('character', char.id)}
							ontogbatch={() => {
								if (isInRefBatch('character', char.id)) {
									removeFromRefBatch('character', char.id);
								} else {
									addToRefBatch('character', char.id);
								}
							}}
							{onopenpreview}
							onopeneditimage={(mode) => editImageModal.open('character', char.id, char.name, mode)}
							ontogglehistory={() =>
								(charImageHistoryId = charImageHistoryId === char.id ? null : char.id)}
						/>
					{/each}
				</div>
				{#if selectedCharCount > 0}
					<div class="mt-3 flex items-center gap-2 border-t border-base-300 pt-3">
						<button
							class="btn gap-1 btn-sm btn-primary"
							onclick={generateSelectedCharacters}
							disabled={generatingCharDescs}
						>
							{#if generatingCharDescs}
								<span class="loading loading-xs loading-spinner"></span>
								Generating...
							{:else}
								Generate Selected ({selectedCharCount})
							{/if}
						</button>
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => (characterAiInputs = {})}
							disabled={generatingCharDescs}
						>
							Clear
						</button>
					</div>
				{/if}
			{:else}
				<p class="mt-2 text-sm text-base-content/50">Add at least one character to continue.</p>
			{/if}
		</div>
	</div>

	<!-- Locations -->
	<div class="card border border-base-300 bg-base-200">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<h2 class="card-title text-lg">
					Locations <span class="badge badge-sm">{locations.length}</span>
				</h2>
				<div class="flex gap-2">
					<button
						class="btn gap-1 btn-sm btn-primary"
						onclick={() => locationsModal.open()}
						disabled={generatingLocations || !project.synopsis?.trim()}
						title="Generate locations with AI"
					>
						{#if generatingLocations}
							<span class="loading loading-xs loading-spinner"></span>
						{/if}
						AI Generate
					</button>
					<button
						class="btn btn-outline btn-sm btn-accent"
						onclick={() => (showAddLocation = !showAddLocation)}
					>
						{showAddLocation ? 'Cancel' : 'Add Location'}
					</button>
				</div>
			</div>

			{#if showAddLocation}
				<form
					method="post"
					action="?/addLocation"
					use:enhance={() =>
						async ({ update }) => {
							showAddLocation = false;
							await update();
						}}
					class="mt-4 space-y-3 rounded-lg bg-base-300 p-4"
				>
					<input
						type="text"
						name="name"
						placeholder="Location name"
						class="input-bordered input input-sm w-full"
						required
					/>
					<textarea
						name="description"
						placeholder="Description..."
						class="textarea-bordered textarea w-full textarea-sm"
					></textarea>
					<button class="btn btn-sm btn-primary">Add</button>
				</form>
			{/if}

			{#if locations.length > 0}
				<div class="mt-2 flex flex-col gap-4">
					{#each locations as loc}
						<LocationCard
							location={loc}
							{projectId}
							isGeneratingImage={!!generatingRefImage[`location-${loc.id}`]}
							isInBatch={isInRefBatch('location', loc.id)}
							submittingBatch={submittingRefBatch}
							historyOpen={locImageHistoryId === loc.id}
							ongeneratefast={() => generateRefImageFast('location', loc.id)}
							ontogbatch={() => {
								if (isInRefBatch('location', loc.id)) {
									removeFromRefBatch('location', loc.id);
								} else {
									addToRefBatch('location', loc.id);
								}
							}}
							{onopenpreview}
							onopeneditimage={(mode) => editImageModal.open('location', loc.id, loc.name, mode)}
							ontogglehistory={() =>
								(locImageHistoryId = locImageHistoryId === loc.id ? null : loc.id)}
						/>
					{/each}
				</div>
			{:else}
				<p class="mt-2 text-sm text-base-content/50">
					Locations are optional but help with scene consistency.
				</p>
			{/if}
		</div>
	</div>

	<!-- Batch Submit + Status -->
	{#if refImageBatchQueue.length > 0}
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="card-title text-lg">Batch Image Queue</h2>
						<p class="text-sm text-base-content/50">
							{refImageBatchQueue.length} item{refImageBatchQueue.length !== 1 ? 's' : ''} queued (1 credit
							each). Images will be processed within 15 minutes.
						</p>
					</div>
					<div class="flex gap-2">
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => (refImageBatchQueue = [])}
							disabled={submittingRefBatch}
						>
							Clear
						</button>
						<button
							class="btn btn-sm btn-primary"
							onclick={submitRefBatch}
							disabled={submittingRefBatch || refImageBatchQueue.length === 0}
						>
							{#if submittingRefBatch}
								<span class="loading loading-xs loading-spinner"></span>
							{/if}
							Submit Batch ({refImageBatchQueue.length})
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Phase 1 -> 2 -->
	{#if phase1Complete}
		<div class="flex justify-end">
			<button class="btn gap-2 btn-primary" onclick={() => ongotostep('refine')}>
				Continue to Refine
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
				</svg>
			</button>
		</div>
	{/if}
</div>

<!-- Per-Character AI Modal -->
<dialog bind:this={charAiDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">AI Generation for {activeCharModalName}</h3>
		<p class="py-2 text-sm text-base-content/60">
			Add optional instructions to guide the AI when generating this character's description and
			visual details.
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., She should have red hair and wear a school uniform..."
			bind:value={charModalInput}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => charAiDialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={saveCharAiModal}>Select for Generation</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Cast Modal -->
<AiInstructionModal
	bind:this={castModal}
	title="Generate Characters & Locations"
	description={characters.length > 0 || locations.length > 0
		? 'Existing characters and locations will be preserved. The AI will only generate new ones. Add optional instructions below.'
		: 'AI will create characters and locations based on your story details. Add optional instructions below.'}
	placeholder="e.g., Add a mother character for the main character who is strict but caring..."
	submitting={generatingCast}
	onsubmit={(input) => generateCast(input)}
/>

<!-- Locations Modal -->
<AiInstructionModal
	bind:this={locationsModal}
	title="Generate Locations with AI"
	description={locations.length > 0
		? 'Existing locations will be preserved. The AI will only generate new ones. Add optional instructions below.'
		: 'AI will create locations based on your story and characters. Add optional instructions below.'}
	placeholder="e.g., Add the city where the main character lives, a dark forest..."
	submitting={generatingLocations}
	onsubmit={(input) => generateLocationsAi(input)}
/>

<!-- Edit Image Modal -->
<EditImageModal bind:this={editImageModal} onsubmit={handleEditImageSubmit} />
