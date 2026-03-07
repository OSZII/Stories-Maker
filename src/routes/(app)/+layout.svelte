<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import Toast from '$lib/components/Toast.svelte';

	let { data, children } = $props();

	async function handleSignOut() {
		await authClient.signOut();
		goto('/login');
	}
</script>

{#if data.user}
	<div class="flex min-h-screen bg-base-100">
		<!-- Sidebar -->
		<aside class="flex w-64 shrink-0 flex-col border-r border-base-300 bg-base-200">
			<div class="border-b border-base-300 p-4">
				<a href="/" class="text-xl font-black tracking-tight">
					<span class="text-primary">Manga</span><span class="text-base-content">Forge</span>
				</a>
			</div>

			<nav class="flex flex-1 flex-col gap-1 p-4">
				<a
					href="/dashboard"
					class="btn justify-start gap-2 btn-ghost btn-sm {page.url.pathname === '/dashboard'
						? 'btn-active'
						: ''}"
				>
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
							d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
						/>
					</svg>
					Dashboard
				</a>
				<a
					href="/dashboard/projects"
					class="btn justify-start gap-2 btn-ghost btn-sm {page.url.pathname.startsWith(
						'/dashboard/projects'
					)
						? 'btn-active'
						: ''}"
				>
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
							d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
						/>
					</svg>
					Projects
				</a>
				<a
					href="/dashboard/billing"
					class="btn justify-start gap-2 btn-ghost btn-sm {page.url.pathname ===
					'/dashboard/billing'
						? 'btn-active'
						: ''}"
				>
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
							d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
						/>
					</svg>
					Billing
				</a>
			</nav>

			<!-- User -->
			<div class="flex items-center gap-3 border-t border-base-300 p-4">
				<div class="placeholder avatar">
					<div class="w-8 rounded-full bg-primary/10 text-primary">
						<span class="text-xs font-bold">{data.user.name?.charAt(0) ?? '?'}</span>
					</div>
				</div>
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm font-medium">{data.user.name}</div>
				</div>
				<button onclick={handleSignOut} class="btn btn-ghost btn-xs" title="Sign out">
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
							d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
						/>
					</svg>
				</button>
			</div>
		</aside>

		<!-- Main content -->
		<main class="flex-1 overflow-auto">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<Toast />
