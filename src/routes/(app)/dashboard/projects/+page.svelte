<!-- Projects list page — displays all user's manga projects with status badges. "New Project" button triggers a form action. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { data } = $props();

	function formatDate(date: Date) {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const statusColors: Record<string, string> = {
		draft: 'badge-ghost',
		refining: 'badge-info',
		scripting: 'badge-warning',
		generating: 'badge-secondary',
		complete: 'badge-success'
	};
</script>

<div class="max-w-4xl p-8">
	<div class="mb-8 flex items-center justify-between">
		<h1 class="text-3xl font-bold">Projects</h1>
		<form method="post" action="?/create" use:enhance>
			<button class="btn gap-2 btn-sm btn-primary">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				New Project
			</button>
		</form>
	</div>

	{#if data.stories.length === 0}
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body items-center py-16 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mb-4 h-16 w-16 text-base-content/20"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
					/>
				</svg>
				<h2 class="text-xl font-bold">No projects yet</h2>
				<p class="mt-1 text-base-content/60">Create your first manga project to get started.</p>
				<form method="post" action="?/create" use:enhance class="mt-4">
					<button class="btn btn-primary">Create First Project</button>
				</form>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.stories as project}
				<a
					href="/dashboard/projects/{project.id}"
					class="card border border-base-300 bg-base-200 transition-colors hover:border-primary/30"
				>
					<div class="card-body flex-row items-center gap-4 py-4">
						<div class="min-w-0 flex-1">
							<h3 class="truncate font-bold">{project.title}</h3>
							<div class="mt-1 flex items-center gap-3">
								{#if project.genre}
									<span class="text-xs text-base-content/50">{project.genre}</span>
								{/if}
								<span class="text-xs text-base-content/40"
									>Updated {formatDate(project.updatedAt)}</span
								>
							</div>
						</div>
						<span class="badge {statusColors[project.status] ?? 'badge-ghost'} badge-sm">
							{project.status}
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
