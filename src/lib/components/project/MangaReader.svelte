<script lang="ts">
	import { getSectionImageUrl } from '$lib/utils/image-urls';

	let {
		chapters,
		projectId,
		onopenpreview
	}: {
		chapters: any[];
		projectId: string;
		onopenpreview: (url: string) => void;
	} = $props();
</script>

<div class="mx-auto max-w-3xl space-y-12">
	{#if chapters.length === 0}
		<p class="text-center text-base-content/50">No chapters generated yet.</p>
	{:else}
		{#each chapters as ch}
			<div>
				<h2 class="mb-6 border-b border-base-300 pb-3 text-center text-2xl font-bold">
					Chapter {ch.chapterNumber}: {ch.title || 'Untitled'}
				</h2>
				{#if ch.sections && ch.sections.length > 0}
					<div class="space-y-6">
						{#each ch.sections as sec}
							{@const imgUrl = getSectionImageUrl(projectId, sec)}
							<div class="space-y-2">
								{#if imgUrl}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="cursor-pointer overflow-hidden rounded-lg"
										onclick={() => onopenpreview(imgUrl)}
									>
										<img
											loading="lazy"
											src={imgUrl}
											alt="Panel {sec.sectionNumber}"
											class="w-full rounded-lg"
										/>
									</div>
								{:else if sec.status === 'generating' || sec.status === 'queued'}
									<div class="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-base-300">
										<span class="loading loading-md loading-spinner text-base-content/30"></span>
									</div>
								{/if}
								{#if sec.narrative}
									<p class="px-2 text-base leading-relaxed text-base-content/80">{sec.narrative}</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-center text-sm text-base-content/40">No panels for this chapter yet.</p>
				{/if}
			</div>
		{/each}
	{/if}
</div>
