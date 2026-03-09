<!--
  Landing page — public marketing page with:
  - Hero section with CTA
  - "How it works" 4-step pipeline explanation
  - Feature highlights (AI story expansion, character sheets, bulk generation, etc.)
  - Pricing section (subscriptions from Polar + credit packs)
  - Footer with browse link
-->
<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();
	let checkoutLoading = $state<string | null>(null);

	/** Format a price from cents to a localized currency string (e.g. $10). */
	function formatPrice(amountInCents: number, currency: string) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			minimumFractionDigits: 0
		}).format(amountInCents / 100);
	}

	/** Handle subscribe/buy click — redirects unauthenticated users to signup, otherwise creates a Polar checkout. */
	async function handleSubscribe(productId: string) {
		if (!data.isAuthenticated) {
			goto('/signup');
			return;
		}

		checkoutLoading = productId;
		try {
			const res = await fetch('/api/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ productId })
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Checkout failed');
			}

			const { url } = await res.json();
			window.location.href = url;
		} finally {
			checkoutLoading = null;
		}
	}
</script>

<div class="min-h-screen bg-base-100">
	<!-- Navbar -->
	<nav class="navbar sticky top-0 z-50 border-b border-base-300 bg-base-100/80 backdrop-blur-lg">
		<div class="container mx-auto">
			<div class="flex-1">
				<a href="/" class="text-2xl font-black tracking-tight">
					<span class="text-primary">Manga</span><span class="text-base-content">Forge</span>
				</a>
			</div>
			<div class="flex gap-2">
				{#if data.isAuthenticated}
					<a href="/dashboard" class="btn btn-sm btn-primary">Dashboard</a>
				{:else}
					<a href="/signup" class="btn btn-sm btn-primary">Get Started</a>
				{/if}
			</div>
		</div>
	</nav>

	<!-- Hero -->
	<section class="relative overflow-hidden">
		<!-- Background glow effects -->
		<div class="pointer-events-none absolute inset-0">
			<div class="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl"></div>
			<div
				class="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-secondary/10 blur-3xl"
			></div>
		</div>

		<div class="relative z-10 container mx-auto px-6 pt-24 pb-32 text-center">
			<div class="mb-6 badge badge-outline font-medium badge-primary">
				AI-Powered Manga Creation
			</div>

			<h1 class="mx-auto max-w-4xl text-5xl leading-tight font-black md:text-7xl">
				Your stories deserve to be
				<span
					class="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent"
				>
					seen
				</span>
			</h1>

			<p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-base-content/60 md:text-xl">
				Go from idea to illustrated manga in minutes. Define your story, let AI expand it into
				detailed scripts, then generate stunning panel-by-panel artwork.
			</p>

			<div class="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
				<a href="/signup" class="btn gap-2 btn-lg btn-primary">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
							clip-rule="evenodd"
						/>
					</svg>
					Start Creating — Free
				</a>
				<a href="#how-it-works" class="btn btn-ghost btn-lg">See How It Works</a>
			</div>

			<!-- Stats -->
			<div class="mt-16 flex flex-wrap justify-center gap-8 text-base-content/50 md:gap-16">
				<div>
					<div class="text-3xl font-bold text-base-content">4 Phases</div>
					<div class="mt-1 text-sm">Structured Pipeline</div>
				</div>
				<div class="divider divider-horizontal"></div>
				<div>
					<div class="text-3xl font-bold text-base-content">AI-Driven</div>
					<div class="mt-1 text-sm">Script & Art Generation</div>
				</div>
				<div class="divider divider-horizontal"></div>
				<div>
					<div class="text-3xl font-bold text-base-content">Any Style</div>
					<div class="mt-1 text-sm">Manga, Manhwa, Webtoon</div>
				</div>
			</div>
		</div>
	</section>

	<!-- How It Works -->
	<section id="how-it-works" class="bg-base-200 py-24">
		<div class="container mx-auto px-6">
			<div class="mb-16 text-center">
				<h2 class="text-3xl font-bold md:text-5xl">From idea to manga in four steps</h2>
				<p class="mx-auto mt-4 max-w-xl text-base-content/60">
					Our structured pipeline guides you through every stage of creation.
				</p>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
				<!-- Step 1 -->
				<div
					class="card border border-base-content/5 bg-base-300 transition-colors hover:border-primary/30"
				>
					<div class="card-body">
						<div class="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15">
							<span class="text-xl font-bold text-primary">1</span>
						</div>
						<h3 class="card-title text-lg">Define</h3>
						<p class="text-sm text-base-content/60">
							Set your title, genre, synopsis, characters, locations, and art style. Build the
							foundation of your world.
						</p>
					</div>
				</div>

				<!-- Step 2 -->
				<div
					class="card border border-base-content/5 bg-base-300 transition-colors hover:border-secondary/30"
				>
					<div class="card-body">
						<div class="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/15">
							<span class="text-xl font-bold text-secondary">2</span>
						</div>
						<h3 class="card-title text-lg">Refine</h3>
						<p class="text-sm text-base-content/60">
							AI expands your synopsis into a full story. Generate character reference sheets and
							scene descriptions.
						</p>
					</div>
				</div>

				<!-- Step 3 -->
				<div
					class="card border border-base-content/5 bg-base-300 transition-colors hover:border-accent/30"
				>
					<div class="card-body">
						<div class="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/15">
							<span class="text-xl font-bold text-accent">3</span>
						</div>
						<h3 class="card-title text-lg">Script</h3>
						<p class="text-sm text-base-content/60">
							Chapters split into panels. AI writes detailed scripts and generates image prompts you
							can review and edit.
						</p>
					</div>
				</div>

				<!-- Step 4 -->
				<div
					class="card border border-base-content/5 bg-base-300 transition-colors hover:border-success/30"
				>
					<div class="card-body">
						<div class="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-success/15">
							<span class="text-xl font-bold text-success">4</span>
						</div>
						<h3 class="card-title text-lg">Generate</h3>
						<p class="text-sm text-base-content/60">
							Bulk image generation brings your panels to life. Review, regenerate, and assemble
							your finished manga.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features -->
	<section class="py-24">
		<div class="container mx-auto px-6">
			<div class="mb-16 text-center">
				<h2 class="text-3xl font-bold md:text-5xl">Everything you need to create</h2>
			</div>

			<div class="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-7 w-7 text-primary"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
							/>
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold">AI Story Expansion</h3>
					<p class="text-sm text-base-content/60">
						Feed in a synopsis — get back a fully structured story with chapter breakdowns,
						character arcs, and pacing.
					</p>
				</div>

				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-7 w-7 text-secondary"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold">Character Sheets</h3>
					<p class="text-sm text-base-content/60">
						Generate detailed visual reference sheets for every character. Maintain consistency
						across all your panels.
					</p>
				</div>

				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-7 w-7 text-accent"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
							/>
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold">Bulk Generation</h3>
					<p class="text-sm text-base-content/60">
						Generate entire chapters of panel artwork at once. Review results, regenerate any panel,
						and pick the best versions.
					</p>
				</div>

				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-info/10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-7 w-7 text-info"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
							/>
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold">Style Presets</h3>
					<p class="text-sm text-base-content/60">
						Choose from curated art styles — dark manhwa, soft shojo watercolor, bold shonen — or
						craft your own.
					</p>
				</div>

				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-7 w-7 text-warning"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
							/>
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold">Full Control</h3>
					<p class="text-sm text-base-content/60">
						Edit any AI-generated prompt, script, or description. You stay in the driver's seat at
						every step.
					</p>
				</div>

				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-7 w-7 text-success"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
							/>
						</svg>
					</div>
					<h3 class="mb-2 text-lg font-bold">Reader Mode</h3>
					<p class="text-sm text-base-content/60">
						Share your manga publicly or via private links. Readers get a smooth vertical-scroll
						experience.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Pricing -->
	<section class="bg-base-200 py-24">
		<div class="container mx-auto px-6">
			<div class="mb-16 text-center">
				<h2 class="text-3xl font-bold md:text-5xl">Simple, creator-friendly pricing</h2>
				<p class="mt-4 text-base-content/60">Start free. Scale as you create.</p>
			</div>

			{#if data.subscriptions.length > 0}
				<div
					class="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2"
					class:lg:grid-cols-3={data.subscriptions.length === 3}
					class:lg:grid-cols-4={data.subscriptions.length >= 4}
				>
					{#each data.subscriptions as plan, i}
						{@const isMostExpensive =
							i === data.subscriptions.length - 1 && data.subscriptions.length > 2}
						{@const isMiddle =
							i === Math.floor(data.subscriptions.length / 2) && data.subscriptions.length > 1}
						<div
							class="card bg-base-300 {isMiddle
								? 'relative border-2 border-primary'
								: 'border border-base-content/5'}"
						>
							{#if isMiddle}
								<div class="absolute -top-3 left-1/2 badge -translate-x-1/2 badge-primary">
									Most Popular
								</div>
							{/if}
							<div class="card-body">
								<h3 class="text-lg font-bold">{plan.name}</h3>
								<div class="mt-2">
									{#if plan.priceAmount === 0}
										<span class="text-4xl font-black">Free</span>
									{:else}
										<span class="text-4xl font-black {isMiddle ? 'text-primary' : ''}"
											>{formatPrice(plan.priceAmount, plan.priceCurrency)}</span
										>
										<span class="text-base-content/50">/mo</span>
									{/if}
								</div>
								{#if plan.credits > 0}
									<p class="mt-1 text-sm text-base-content/50">
										{plan.credits.toLocaleString()} credits/month
									</p>
								{/if}
								{#if plan.description}
									<p class="mt-3 text-sm text-base-content/60">{plan.description}</p>
								{/if}
								<div class="mt-6 card-actions">
									{#if plan.priceAmount === 0}
										<a
											href={data.isAuthenticated ? '/dashboard' : '/signup'}
											class="btn w-full btn-sm {isMiddle ? 'btn-primary' : 'btn-outline'}"
										>
											Get Started
										</a>
									{:else}
										<button
											onclick={() => handleSubscribe(plan.id)}
											disabled={checkoutLoading === plan.id}
											class="btn w-full btn-sm {isMiddle ? 'btn-primary' : 'btn-outline'}"
										>
											{#if checkoutLoading === plan.id}
												<span class="loading loading-xs loading-spinner"></span>
											{:else}
												Subscribe
											{/if}
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if data.creditPacks.length > 0}
				<div class="mx-auto mt-16 max-w-2xl">
					<div class="mb-8 text-center">
						<h3 class="text-2xl font-bold">Need more credits?</h3>
						<p class="mt-2 text-base-content/60">Buy credit packs anytime. Credits never expire.</p>
					</div>
					<div
						class="grid grid-cols-1 gap-4"
						class:sm:grid-cols-2={data.creditPacks.length === 2}
						class:sm:grid-cols-3={data.creditPacks.length >= 3}
					>
						{#each data.creditPacks as pack}
							<div class="card border border-base-content/5 bg-base-300">
								<div class="card-body items-center text-center">
									<h4 class="font-bold">{pack.name}</h4>
									<p class="text-3xl font-black">
										{formatPrice(pack.priceAmount, pack.priceCurrency)}
									</p>
									{#if pack.credits > 0}
										<p class="text-sm text-base-content/50">
											{pack.credits.toLocaleString()} credits
										</p>
									{/if}
									<div class="mt-4 card-actions">
										<button
											onclick={() => handleSubscribe(pack.id)}
											disabled={checkoutLoading === pack.id}
											class="btn btn-outline btn-sm"
										>
											{#if checkoutLoading === pack.id}
												<span class="loading loading-xs loading-spinner"></span>
											{:else}
												Buy Pack
											{/if}
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- CTA -->
	<section class="py-24">
		<div class="container mx-auto px-6 text-center">
			<div class="mx-auto max-w-2xl">
				<h2 class="text-3xl font-bold md:text-5xl">Ready to forge your first manga?</h2>
				<p class="mt-4 text-lg text-base-content/60">
					Join creators who are turning their stories into illustrated manga with the power of AI.
				</p>
				<a href="/signup" class="btn mt-8 btn-lg btn-primary">Start Creating — It's Free</a>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-base-300 py-10">
		<div
			class="container mx-auto flex flex-col items-center justify-between gap-4 px-6 text-sm text-base-content/40 md:flex-row"
		>
			<div>
				<span class="font-bold text-base-content/60">MangaForge</span> — AI-powered manga creation
			</div>
			<div class="flex gap-6">
				<a href="/browse" class="transition-colors hover:text-base-content">Browse</a>
			</div>
		</div>
	</footer>
</div>
