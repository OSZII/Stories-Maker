<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { addToast } from '$lib/stores/toast.svelte';
	import MangaReader from './MangaReader.svelte';
	import ChapterEditor from './ChapterEditor.svelte';
	import AiInstructionModal from './AiInstructionModal.svelte';

	let {
		project,
		chapters,
		projectId,
		generatingImages,
		jobStatus,
		activeJobId,
		startImageGeneration,
		onopenpreview,
		ongotostep
	}: {
		project: any;
		chapters: any[];
		projectId: string;
		generatingImages: boolean;
		jobStatus: {
			status: string;
			totalItems: number;
			completedItems: number;
			failedItems: number;
		} | null;
		activeJobId: string | null;
		startImageGeneration: (
			mode: 'batch' | 'fast',
			sectionIds?: string[],
			userInstructions?: Record<string, string>
		) => Promise<void>;
		onopenpreview: (url: string) => void;
		ongotostep: (step: string) => void;
	} = $props();

	let readMode = $state(false);
	let sectionBatchQueue = $state<Array<{ sectionId: string }>>([]);
	let submittingSectionBatch = $state(false);

	// Section image modal state
	let sectionImageModal: AiInstructionModal;
	let sectionImageMode = $state<'fast' | 'batch'>('fast');
	let sectionImageTargetId = $state('');
	let sectionImageTargetLabel = $state('');
	let sectionImagePrompt = $state('');

	function isInSectionBatch(sectionId: string) {
		return sectionBatchQueue.some((q) => q.sectionId === sectionId);
	}

	function openSectionImageModal(
		sectionId: string,
		label: string,
		mode: 'fast' | 'batch',
		existingPrompt: string
	) {
		sectionImageTargetId = sectionId;
		sectionImageTargetLabel = label;
		sectionImageMode = mode;
		sectionImagePrompt = existingPrompt;
		sectionImageDialog?.showModal();
	}

	let sectionImageDialog = $state<HTMLDialogElement | null>(null);

	async function saveSectionPrompt(sectionId: string, imagePrompt: string) {
		const formData = new FormData();
		formData.set('sectionId', sectionId);
		formData.set('imagePrompt', imagePrompt);
		await fetch('?/updateSectionPrompt', { method: 'POST', body: formData });
	}

	async function submitSectionImageModal() {
		sectionImageDialog?.close();
		await saveSectionPrompt(sectionImageTargetId, sectionImagePrompt);
		await invalidateAll();

		if (sectionImageMode === 'fast') {
			startImageGeneration('fast', [sectionImageTargetId]);
		} else {
			if (!sectionBatchQueue.some((q) => q.sectionId === sectionImageTargetId)) {
				sectionBatchQueue = [...sectionBatchQueue, { sectionId: sectionImageTargetId }];
			}
		}
	}

	async function submitSectionBatch() {
		if (sectionBatchQueue.length === 0) return;
		submittingSectionBatch = true;
		try {
			const sectionIds = sectionBatchQueue.map((q) => q.sectionId);
			await startImageGeneration('batch', sectionIds);
			sectionBatchQueue = [];
		} finally {
			submittingSectionBatch = false;
		}
	}
</script>

<!-- Read Mode Toggle -->
<div class="mb-6 flex justify-end">
	<label class="label cursor-pointer gap-3">
		<span class="label-text text-sm">Read Mode</span>
		<input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={readMode} />
	</label>
</div>

{#if readMode}
	<MangaReader {chapters} {projectId} {onopenpreview} />
{:else}
	<!-- EDIT MODE -->
	<div class="space-y-6">
		<!-- Image Generation Controls -->
		{#if chapters.length > 0}
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body">
					<h2 class="card-title text-lg">Image Generation</h2>

					{#if jobStatus && (generatingImages || activeJobId)}
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<span class="loading loading-sm loading-spinner"></span>
								<span class="text-sm">
									{jobStatus.status === 'submitted'
										? 'Waiting for batch to start...'
										: 'Generating images...'}
								</span>
							</div>
							<progress
								class="progress w-full progress-primary"
								value={jobStatus.completedItems + jobStatus.failedItems}
								max={jobStatus.totalItems}
							></progress>
							<p class="text-xs text-base-content/60">
								{jobStatus.completedItems}/{jobStatus.totalItems} completed
								{#if jobStatus.failedItems > 0}
									, {jobStatus.failedItems} failed
								{/if}
							</p>
						</div>
					{:else}
						<p class="text-sm text-base-content/50">
							Generate panel images for all sections that have image prompts.
						</p>
						<div class="mt-2 flex gap-3">
							<button
								class="btn btn-sm btn-primary"
								onclick={() => startImageGeneration('batch')}
								disabled={generatingImages}
							>
								Start Processing (1 credit/image)
							</button>
							<button
								class="btn btn-sm btn-secondary"
								onclick={() => startImageGeneration('fast')}
								disabled={true}
							>
								Fast (2 credits/image)
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Batch Queue Card -->
		{#if sectionBatchQueue.length > 0}
			<div class="card border border-warning bg-base-200">
				<div class="card-body py-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-sm font-bold">Batch Queue</h3>
							<p class="text-xs text-base-content/60">
								{sectionBatchQueue.length} section(s) queued — {sectionBatchQueue.length} credit(s)
							</p>
						</div>
						<div class="flex gap-2">
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => (sectionBatchQueue = [])}
								disabled={submittingSectionBatch}
							>
								Clear
							</button>
							<button
								class="btn btn-sm btn-primary"
								onclick={submitSectionBatch}
								disabled={submittingSectionBatch || generatingImages}
							>
								{#if submittingSectionBatch}
									<span class="loading loading-xs loading-spinner"></span>
								{/if}
								Start Batch ({sectionBatchQueue.length})
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if chapters.length === 0}
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body items-center py-12 text-center">
					<p class="text-base-content/50">No chapters generated yet.</p>
					<button class="btn mt-3 btn-sm btn-primary" onclick={() => ongotostep('refine')}>
						Go to Refine Phase
					</button>
				</div>
			</div>
		{:else}
			{#each chapters as ch}
				<ChapterEditor
					chapter={ch}
					{projectId}
					{generatingImages}
					{startImageGeneration}
					{onopenpreview}
					{isInSectionBatch}
					{openSectionImageModal}
				/>
			{/each}
		{/if}
	</div>
{/if}

<!-- Section Image Generation Modal -->
<dialog bind:this={sectionImageDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">
			Generate Image — {sectionImageTargetLabel}
		</h3>
		<p class="py-2 text-sm text-base-content/60">
			{#if sectionImageMode === 'fast'}
				Generate immediately (2 credits/image).
			{:else}
				Add to batch queue (1 credit/image).
			{/if}
			Edit the prompt below — changes will be saved.
		</p>
		<textarea
			class="textarea-bordered textarea w-full font-mono textarea-sm"
			bind:value={sectionImagePrompt}
			rows="8"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => sectionImageDialog?.close()}>Cancel</button>
			<button
				class="btn btn-primary"
				onclick={submitSectionImageModal}
				disabled={!sectionImagePrompt.trim()}
			>
				{sectionImageMode === 'fast' ? 'Generate Now' : 'Add to Batch'}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
