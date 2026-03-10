<!--
  Project detail / editor page — the main 3-phase manga creation workflow.
  This orchestrator manages phase routing, job polling, and the shared image preview modal.
-->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { addToast } from '$lib/stores/toast.svelte';
	import ProjectHeader from '$lib/components/project/ProjectHeader.svelte';
	import DefinePhase from '$lib/components/project/DefinePhase.svelte';
	import RefinePhase from '$lib/components/project/RefinePhase.svelte';
	import ScriptPhase from '$lib/components/project/ScriptPhase.svelte';
	import ImagePreviewModal from '$lib/components/project/ImagePreviewModal.svelte';

	let { data, form } = $props();

	let imagePreviewModal: ImagePreviewModal;

	// Phase completion checks
	let phase1Complete = $derived(
		!!data.project.title?.trim() && !!data.project.synopsis?.trim() && data.characters.length > 0
	);
	let phase2Complete = $derived(
		!!data.project.detailedStory?.trim() &&
			data.chapters.some((ch: { sections?: unknown[] }) => ch.sections && ch.sections.length > 0)
	);

	// Image generation job state (shared across phases)
	let generatingImages = $state(false);
	let activeJobId = $state<string | null>(null);
	let jobStatus = $state<{
		status: string;
		totalItems: number;
		completedItems: number;
		failedItems: number;
	} | null>(null);

	// Initialize from server data
	$effect(() => {
		const job = data.activeJob;
		if (job && !activeJobId) {
			activeJobId = job.id;
			generatingImages = true;
			jobStatus = {
				status: job.status,
				totalItems: job.totalItems,
				completedItems: job.completedItems,
				failedItems: job.failedItems
			};
		}
	});

	// Poll for generation status
	$effect(() => {
		if (!activeJobId) return;

		const interval = setInterval(async () => {
			const res = await fetch(`/api/ai/generation-status?jobId=${activeJobId}`);
			if (!res.ok) return;
			const { job } = await res.json();
			if (!job) return;

			jobStatus = {
				status: job.status,
				totalItems: job.totalItems,
				completedItems: job.completedItems,
				failedItems: job.failedItems
			};

			if (['completed', 'failed', 'partial'].includes(job.status)) {
				clearInterval(interval);
				generatingImages = false;
				activeJobId = null;
				await invalidateAll();
			}
		}, 5000);

		return () => clearInterval(interval);
	});

	async function startImageGeneration(
		mode: 'batch' | 'fast',
		sectionIds?: string[],
		userInstructions?: Record<string, string>
	) {
		generatingImages = true;
		try {
			const res = await fetch('/api/ai/generate-images', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storyId: data.project.id,
					mode,
					sectionIds: sectionIds || undefined,
					userInstructions: userInstructions || undefined
				})
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to start image generation. Please try again later.', 'error');
				}
				generatingImages = false;
				return;
			}
			const result = await res.json();
			activeJobId = result.jobId;
			jobStatus = {
				status: 'processing',
				totalItems: result.totalImages,
				completedItems: 0,
				failedItems: 0
			};
		} catch {
			generatingImages = false;
		}
	}

	function gotoStep(step: string) {
		let url = page.url.pathname.replace(page.params.step ?? '', step);
		goto(url);
	}

	function openImagePreview(url: string) {
		imagePreviewModal.open(url);
	}
</script>

<div class="w-full p-8">
	<ProjectHeader
		title={data.project.title}
		status={data.project.status}
		currentStep={page.params.step ?? 'define'}
		{phase1Complete}
		{phase2Complete}
		ongotostep={gotoStep}
	/>

	{#if page.params.step === 'define'}
		<DefinePhase
			project={data.project}
			characters={data.characters}
			locations={data.locations}
			projectId={data.project.id}
			{phase1Complete}
			ongotostep={gotoStep}
			onopenpreview={openImagePreview}
		/>
	{/if}

	{#if page.params.step === 'refine'}
		<RefinePhase
			project={data.project}
			chapters={data.chapters}
			projectId={data.project.id}
			ongotostep={gotoStep}
		/>
	{/if}

	{#if page.params.step === 'script'}
		<ScriptPhase
			project={data.project}
			chapters={data.chapters}
			projectId={data.project.id}
			{generatingImages}
			{jobStatus}
			{activeJobId}
			{startImageGeneration}
			onopenpreview={openImagePreview}
			ongotostep={gotoStep}
		/>
	{/if}
</div>

<ImagePreviewModal bind:this={imagePreviewModal} />
