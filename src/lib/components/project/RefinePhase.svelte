<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { addToast } from '$lib/stores/toast.svelte';
	import AiInstructionModal from './AiInstructionModal.svelte';

	let {
		project,
		chapters,
		projectId,
		ongotostep
	}: {
		project: any;
		chapters: any[];
		projectId: string;
		ongotostep: (step: string) => void;
	} = $props();

	let expandingStory = $state(false);
	let generatingOutline = $state(false);
	let generatingChapterDetail = $state<Record<string, boolean>>({});
	let generatingChapterSections = $state<Record<string, boolean>>({});
	let generatingAllDetails = $state(false);
	let generatingAllSections = $state(false);

	let hasDetailedStory = $derived(!!project.detailedStory?.trim());
	let hasChapters = $derived(chapters.length > 0);
	let hasScriptedChapters = $derived(
		chapters.some((ch: { detailedScript?: string | null }) => !!ch.detailedScript)
	);
	let hasChaptersWithSections = $derived(
		chapters.some((ch: { sections?: unknown[] }) => ch.sections && ch.sections.length > 0)
	);

	let storyOverviewModal: AiInstructionModal;
	let chapterGenModal: AiInstructionModal;
	let chapterGenAction = $state<'outline' | 'detail' | 'sections' | null>(null);
	let chapterGenTargetId = $state<string | null>(null);

	async function expandStory(userInput?: string) {
		expandingStory = true;
		try {
			const res = await fetch('/api/ai/expand-story', {
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
					addToast('Failed to expand story. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			expandingStory = false;
		}
	}

	async function generateChapterOutline(userInput?: string) {
		generatingOutline = true;
		try {
			const res = await fetch('/api/ai/generate-chapter-outline', {
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
					addToast('Failed to generate chapter outline. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			generatingOutline = false;
		}
	}

	async function generateChapterDetail(chapterId: string, userInput?: string) {
		generatingChapterDetail = { ...generatingChapterDetail, [chapterId]: true };
		try {
			const res = await fetch('/api/ai/generate-chapter-detail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: projectId, chapterId, userInput: userInput || undefined })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate chapter detail. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			const { [chapterId]: _, ...rest } = generatingChapterDetail;
			generatingChapterDetail = rest;
		}
	}

	async function generateChapterSections(chapterId: string, userInput?: string) {
		generatingChapterSections = { ...generatingChapterSections, [chapterId]: true };
		try {
			const res = await fetch('/api/ai/generate-chapter-sections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: projectId, chapterId, userInput: userInput || undefined })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate sections. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			const { [chapterId]: _, ...rest } = generatingChapterSections;
			generatingChapterSections = rest;
		}
	}

	async function generateAllChapterDetails() {
		generatingAllDetails = true;
		try {
			for (const ch of chapters) {
				if (!ch.detailedScript) {
					await generateChapterDetail(ch.id);
				}
			}
		} finally {
			generatingAllDetails = false;
		}
	}

	async function generateAllChapterSections() {
		generatingAllSections = true;
		try {
			for (const ch of chapters) {
				if (ch.detailedScript && (!ch.sections || ch.sections.length === 0)) {
					await generateChapterSections(ch.id);
				}
			}
		} finally {
			generatingAllSections = false;
		}
	}

	function openChapterGenModal(action: 'outline' | 'detail' | 'sections', chapterId?: string) {
		chapterGenAction = action;
		chapterGenTargetId = chapterId ?? null;
		chapterGenModal.open();
	}

	function handleChapterGenSubmit(feedback: string) {
		if (chapterGenAction === 'outline') {
			generateChapterOutline(feedback);
		} else if (chapterGenAction === 'detail' && chapterGenTargetId) {
			generateChapterDetail(chapterGenTargetId, feedback);
		} else if (chapterGenAction === 'sections' && chapterGenTargetId) {
			generateChapterSections(chapterGenTargetId, feedback);
		}
	}

	function chapterGenModalTitle(): string {
		switch (chapterGenAction) {
			case 'outline':
				return 'Generate Chapter Outline';
			case 'detail':
				return 'Generate Chapter Detail';
			case 'sections':
				return 'Generate Sections / Panels';
			default:
				return 'Generate';
		}
	}
</script>

<div class="space-y-6">
	<!-- Step 1: Story Overview -->
	<div class="card border border-base-300 bg-base-200">
		<div class="card-body">
			<div class="flex items-center justify-between">
				<h2 class="card-title text-lg">Step 1 — Story Overview</h2>
				<div class="flex gap-2">
					{#if hasDetailedStory}
						<button
							class="btn gap-1 btn-outline btn-sm"
							onclick={() => storyOverviewModal.open()}
							disabled={expandingStory}
						>
							{#if expandingStory}
								<span class="loading loading-xs loading-spinner"></span>
							{/if}
							Regenerate
						</button>
					{/if}
				</div>
			</div>
			{#if !hasDetailedStory}
				<p class="text-sm text-base-content/50">
					Generate a detailed story overview from your synopsis and characters.
				</p>
				<button
					class="btn mt-2 gap-2 btn-sm btn-primary"
					onclick={() => storyOverviewModal.open()}
					disabled={expandingStory}
				>
					{#if expandingStory}
						<span class="loading loading-xs loading-spinner"></span>
						Generating...
					{:else}
						Generate Story Overview
					{/if}
				</button>
			{:else}
				<form method="post" action="?/updateDetailedStory" use:enhance class="mt-2">
					<textarea
						name="detailedStory"
						class="textarea-bordered textarea h-64 w-full font-mono text-sm"
						placeholder="The detailed story will appear here after AI expansion..."
						>{project.detailedStory ?? ''}</textarea
					>
					<div class="mt-3 flex justify-end">
						<button class="btn btn-sm btn-primary">Save Changes</button>
					</div>
				</form>
			{/if}
		</div>
	</div>

	<!-- Step 2: Chapter Outline -->
	{#if hasDetailedStory}
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<h2 class="card-title text-lg">Step 2 — Chapter Outline</h2>
					{#if hasChapters}
						<button
							class="btn gap-1 btn-outline btn-sm"
							onclick={() => openChapterGenModal('outline')}
							disabled={generatingOutline}
						>
							{#if generatingOutline}
								<span class="loading loading-xs loading-spinner"></span>
							{/if}
							Regenerate Outline
						</button>
					{/if}
				</div>
				{#if !hasChapters}
					<p class="text-sm text-base-content/50">
						Split your story overview into chapters. The AI will decide the appropriate number
						of chapters.
					</p>
					<button
						class="btn mt-2 gap-2 btn-sm btn-primary"
						onclick={() => openChapterGenModal('outline')}
						disabled={generatingOutline}
					>
						{#if generatingOutline}
							<span class="loading loading-xs loading-spinner"></span>
							Splitting into Chapters...
						{:else}
							Split into Chapters
						{/if}
					</button>
				{:else}
					<div class="mt-2 divide-y divide-base-300">
						{#each chapters as ch}
							<div class="py-3">
								<form method="post" action="?/updateChapter" use:enhance class="space-y-2">
									<input type="hidden" name="chapterId" value={ch.id} />
									<div class="flex items-center gap-2">
										<span class="badge badge-ghost badge-sm">Ch. {ch.chapterNumber}</span>
										<input
											type="text"
											name="title"
											value={ch.title ?? ''}
											class="input-bordered input input-sm flex-1"
											placeholder="Chapter title"
										/>
									</div>
									<textarea
										name="summary"
										class="textarea-bordered textarea w-full textarea-sm"
										rows="2"
										placeholder="Chapter summary...">{ch.summary ?? ''}</textarea
									>
									<input type="hidden" name="detailedScript" value={ch.detailedScript ?? ''} />
									<div class="flex justify-end">
										<button class="btn btn-xs btn-primary">Save</button>
									</div>
								</form>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Step 3: Chapter Details -->
	{#if hasChapters}
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<h2 class="card-title text-lg">Step 3 — Chapter Details</h2>
					<button
						class="btn gap-1 btn-outline btn-sm"
						onclick={generateAllChapterDetails}
						disabled={generatingAllDetails}
					>
						{#if generatingAllDetails}
							<span class="loading loading-xs loading-spinner"></span>
							Generating All...
						{:else}
							Generate All Details
						{/if}
					</button>
				</div>
				<p class="text-sm text-base-content/50">
					Generate the full detailed script for each chapter individually.
				</p>
				<div class="mt-2 divide-y divide-base-300">
					{#each chapters as ch}
						<div class="py-3">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="badge badge-ghost badge-sm">Ch. {ch.chapterNumber}</span>
									<span class="text-sm font-medium">{ch.title || 'Untitled'}</span>
									{#if ch.detailedScript}
										<span class="badge badge-xs badge-success">scripted</span>
									{:else}
										<span class="badge badge-xs badge-warning">pending</span>
									{/if}
								</div>
								<button
									class="btn gap-1 btn-sm {ch.detailedScript ? 'btn-ghost' : 'btn-primary'}"
									onclick={() => openChapterGenModal('detail', ch.id)}
									disabled={generatingChapterDetail[ch.id] || generatingAllDetails}
								>
									{#if generatingChapterDetail[ch.id]}
										<span class="loading loading-xs loading-spinner"></span>
										Generating...
									{:else}
										{ch.detailedScript ? 'Regenerate' : 'Generate Detail'}
									{/if}
								</button>
							</div>
							{#if ch.detailedScript}
								<details class="mt-2">
									<summary class="cursor-pointer text-xs text-base-content/50">
										Show script ({ch.detailedScript.length} chars)
									</summary>
									<pre
										class="mt-1 max-h-40 overflow-auto rounded bg-base-300 p-2 text-xs whitespace-pre-wrap">{ch.detailedScript}</pre>
								</details>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Step 4: Sections -->
	{#if hasScriptedChapters}
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<h2 class="card-title text-lg">Step 4 — Sections / Panels</h2>
					<button
						class="btn gap-1 btn-outline btn-sm"
						onclick={generateAllChapterSections}
						disabled={generatingAllSections}
					>
						{#if generatingAllSections}
							<span class="loading loading-xs loading-spinner"></span>
							Generating All...
						{:else}
							Generate All Sections
						{/if}
					</button>
				</div>
				<p class="text-sm text-base-content/50">
					Break each scripted chapter into manga panels/sections.
				</p>
				<div class="mt-2 divide-y divide-base-300">
					{#each chapters as ch}
						{#if ch.detailedScript}
							<div class="flex items-center justify-between py-3">
								<div class="flex items-center gap-2">
									<span class="badge badge-ghost badge-sm">Ch. {ch.chapterNumber}</span>
									<span class="text-sm font-medium">{ch.title || 'Untitled'}</span>
									{#if ch.sections && ch.sections.length > 0}
										<span class="badge badge-xs badge-success"
											>{ch.sections.length} sections</span
										>
									{:else}
										<span class="badge badge-xs badge-warning">no sections</span>
									{/if}
								</div>
								<button
									class="btn gap-1 btn-sm {ch.sections && ch.sections.length > 0
										? 'btn-ghost'
										: 'btn-primary'}"
									onclick={() => openChapterGenModal('sections', ch.id)}
									disabled={generatingChapterSections[ch.id] || generatingAllSections}
								>
									{#if generatingChapterSections[ch.id]}
										<span class="loading loading-xs loading-spinner"></span>
										Generating...
									{:else}
										{ch.sections && ch.sections.length > 0 ? 'Regenerate' : 'Generate Sections'}
									{/if}
								</button>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Phase 2 -> 3 -->
	{#if hasChaptersWithSections}
		<div class="flex justify-end">
			<button class="btn gap-2 btn-primary" onclick={() => ongotostep('script')}>
				Continue to Script
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

<!-- Story Overview Modal -->
<AiInstructionModal
	bind:this={storyOverviewModal}
	title="Generate Story Overview"
	description={hasDetailedStory
		? 'The current story overview will be fed back to the AI as a base. Add optional instructions to guide changes or improvements.'
		: 'AI will generate a detailed story overview from your synopsis and characters. Add optional instructions below.'}
	placeholder="e.g., Make the ending more dramatic, add a betrayal subplot, focus more on the romance..."
	submitting={expandingStory}
	onsubmit={(input) => expandStory(input)}
/>

<!-- Chapter Generation Modal -->
<AiInstructionModal
	bind:this={chapterGenModal}
	title={chapterGenModalTitle()}
	description="Add optional instructions to guide the AI generation."
	placeholder="e.g., Make chapters shorter, focus on action scenes, include a cliffhanger..."
	onsubmit={handleChapterGenSubmit}
/>
