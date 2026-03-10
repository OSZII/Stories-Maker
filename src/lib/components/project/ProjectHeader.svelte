<script lang="ts">
	let {
		title,
		status,
		currentStep,
		phase1Complete,
		phase2Complete,
		ongotostep
	}: {
		title: string;
		status: string;
		currentStep: string;
		phase1Complete: boolean;
		phase2Complete: boolean;
		ongotostep: (step: string) => void;
	} = $props();
</script>

<div class="mb-6 flex items-center gap-3">
	<a href="/dashboard/projects" class="btn btn-square btn-ghost btn-sm" title="Back to projects">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
		</svg>
	</a>
	<div>
		<h1 class="text-2xl font-bold">{title}</h1>
		<span class="badge badge-ghost badge-sm">{status}</span>
	</div>
</div>

<div class="tabs-box mb-8 tabs">
	<button class="tab {currentStep === 'define' ? 'tab-active' : ''}" onclick={() => ongotostep('define')}>
		1. Define
	</button>
	<button
		class="tab {currentStep === 'refine' ? 'tab-active' : ''}"
		onclick={() => ongotostep('refine')}
		disabled={!phase1Complete}
	>
		2. Refine
	</button>
	<button
		class="tab {currentStep === 'script' ? 'tab-active' : ''}"
		onclick={() => ongotostep('script')}
		disabled={!phase2Complete}
	>
		3. Script
	</button>
</div>
