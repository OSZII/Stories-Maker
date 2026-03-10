<script lang="ts">
	import { enhance } from '$app/forms';
	import { getSectionImageUrl } from '$lib/utils/image-urls';

	let {
		chapter,
		projectId,
		generatingImages,
		startImageGeneration,
		onopenpreview,
		isInSectionBatch,
		openSectionImageModal
	}: {
		chapter: any;
		projectId: string;
		generatingImages: boolean;
		startImageGeneration: (mode: 'batch' | 'fast', sectionIds?: string[]) => void;
		onopenpreview: (url: string) => void;
		isInSectionBatch: (sectionId: string) => boolean;
		openSectionImageModal: (
			sectionId: string,
			label: string,
			mode: 'fast' | 'batch',
			existingPrompt: string
		) => void;
	} = $props();
</script>

<div class="card border border-base-300 bg-base-200">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<h2 class="card-title text-lg">
				Chapter {chapter.chapterNumber}: {chapter.title || 'Untitled'}
			</h2>
			<span class="badge badge-ghost badge-sm">{chapter.status}</span>
		</div>

		<form method="post" action="?/updateChapter" use:enhance class="mt-2 space-y-3">
			<input type="hidden" name="chapterId" value={chapter.id} />
			<label class="form-control w-full">
				<div class="label"><span class="label-text text-sm">Title</span></div>
				<input
					type="text"
					name="title"
					value={chapter.title ?? ''}
					class="input-bordered input input-sm w-full"
				/>
			</label>
			<label class="form-control w-full">
				<div class="label"><span class="label-text text-sm">Summary</span></div>
				<textarea
					name="summary"
					class="textarea-bordered textarea h-20 w-full textarea-sm"
					>{chapter.summary ?? ''}</textarea
				>
			</label>
			<label class="form-control w-full">
				<div class="label">
					<span class="label-text text-sm">Detailed Script</span>
				</div>
				<textarea
					name="detailedScript"
					class="textarea-bordered textarea h-40 w-full font-mono textarea-sm"
					placeholder="Chapter script with panel descriptions..."
					>{chapter.detailedScript ?? ''}</textarea
				>
			</label>
			<div class="flex justify-end">
				<button class="btn btn-sm btn-primary">Save Chapter</button>
			</div>
		</form>

		<!-- Sections -->
		{#if chapter.sections && chapter.sections.length > 0}
			<div class="mt-4">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-sm font-medium">
						Sections/Panels ({chapter.sections.length})
					</h3>
					<div class="flex gap-1">
						<button
							class="btn btn-xs btn-primary"
							onclick={() =>
								startImageGeneration(
									'fast',
									chapter.sections
										.filter((s: { imagePrompt?: string | null }) => s.imagePrompt)
										.map((s: { id: string }) => s.id)
								)}
							disabled={true}
						>
							Generate All
						</button>
						<button
							class="btn btn-outline btn-xs"
							onclick={() =>
								startImageGeneration(
									'batch',
									chapter.sections
										.filter((s: { imagePrompt?: string | null }) => s.imagePrompt)
										.map((s: { id: string }) => s.id)
								)}
							disabled={generatingImages}
						>
							Batch All
						</button>
					</div>
				</div>
				<div class="space-y-2">
					{#each chapter.sections as sec}
						<div class="rounded-lg bg-base-300 p-3">
							<div class="mb-1 flex items-center justify-between">
								<span class="text-xs font-medium">Panel {sec.sectionNumber}</span>
								<div class="flex items-center gap-1">
									<span class="badge badge-outline badge-xs">{sec.sectionType}</span>
									<span class="badge badge-ghost badge-xs">{sec.panelLayout}</span>
									{#if sec.status === 'generating'}
										<span class="badge badge-xs badge-warning">generating</span>
									{:else if sec.status === 'complete'}
										<span class="badge badge-xs badge-success">complete</span>
									{/if}
								</div>
							</div>
							{#if sec.narrative}
								<p class="text-sm text-base-content/70">{sec.narrative}</p>
							{/if}
							{#if sec.imagePrompt}
								<p class="mt-1 text-xs text-base-content/40 italic">
									Prompt: {sec.imagePrompt}
								</p>
								{#if sec.status !== 'generating' && sec.status !== 'complete'}
									<div class="mt-1 flex gap-1">
										<button
											class="btn btn-xs btn-primary"
											onclick={() =>
												openSectionImageModal(
													sec.id,
													`Panel ${sec.sectionNumber}`,
													'fast',
													sec.imagePrompt ?? ''
												)}
											disabled={true}
										>
											Generate
										</button>
										{#if !isInSectionBatch(sec.id)}
											<button
												class="btn btn-outline btn-xs"
												onclick={() =>
													openSectionImageModal(
														sec.id,
														`Panel ${sec.sectionNumber}`,
														'batch',
														sec.imagePrompt ?? ''
													)}
												disabled={generatingImages}
											>
												Add to Batch
											</button>
										{:else}
											<span class="badge badge-xs badge-info">In batch</span>
										{/if}
									</div>
								{/if}
							{/if}
							{#if sec.images && sec.images.length > 0}
								<div class="mt-2 flex flex-wrap gap-2">
									{#each sec.images as img}
										<div
											class="relative h-24 w-24 overflow-hidden rounded border-2 {img.isSelected
												? 'border-primary'
												: 'border-base-content/10'}"
										>
											<img
												loading="lazy"
												src={getSectionImageUrl(projectId, sec)}
												alt="Panel {sec.sectionNumber} v{img.version}"
												class="h-full w-full object-cover"
											/>
											{#if img.isSelected}
												<div class="absolute top-0.5 right-0.5">
													<span class="badge badge-xs badge-primary">selected</span>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
