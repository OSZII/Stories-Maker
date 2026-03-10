<script lang="ts">
	import { enhance } from '$app/forms';

	let {
		project,
		genres,
		artStyles
	}: {
		project: { title: string; genre: string | null; artStyle: string | null; synopsis: string | null };
		genres: readonly string[];
		artStyles: readonly string[];
	} = $props();
</script>

<div class="card border border-base-300 bg-base-200">
	<div class="card-body">
		<h2 class="card-title text-lg">Story Details</h2>
		<form method="post" action="?/updateStory" use:enhance class="mt-2 space-y-4">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Title</span></div>
					<input
						type="text"
						name="title"
						value={project.title}
						class="input-bordered input w-full"
						required
					/>
				</label>
				<label class="form-control w-full">
					<div class="label"><span class="label-text">Genre</span></div>
					<select name="genre" class="select-bordered select w-full">
						<option value="">Select genre...</option>
						{#each genres as g}
							<option value={g} selected={project.genre === g}>{g}</option>
						{/each}
					</select>
				</label>
			</div>
			<label class="form-control w-full">
				<div class="label"><span class="label-text">Art Style</span></div>
				<select name="artStyle" class="select-bordered select w-full">
					<option value="">Select style...</option>
					{#each artStyles as s}
						<option value={s} selected={project.artStyle === s}>{s}</option>
					{/each}
				</select>
			</label>
			<label class="form-control w-full">
				<div class="label"><span class="label-text">Synopsis</span></div>
				<textarea
					name="synopsis"
					class="textarea-bordered textarea h-32 w-full"
					placeholder="Describe your story idea...">{project.synopsis ?? ''}</textarea
				>
			</label>
			<div class="flex justify-end">
				<button class="btn btn-sm btn-primary">Save Details</button>
			</div>
		</form>
	</div>
</div>
