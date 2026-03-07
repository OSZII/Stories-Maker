<div class="min-h-screen bg-base-100">
	<!-- Navbar -->
	<nav class="navbar bg-base-100/80 backdrop-blur-lg border-b border-base-300 sticky top-0 z-50">
		<div class="container mx-auto">
			<div class="flex-1">
				<a href="/" class="text-2xl font-black tracking-tight">
					<span class="text-primary">Manga</span><span class="text-base-content">Forge</span>
				</a>
			</div>
			<div class="flex gap-2">
				<a href="/login" class="btn btn-ghost btn-sm">Log in</a>
				<a href="/register" class="btn btn-primary btn-sm">Get Started</a>
			</div>
		</div>
	</nav>

	<!-- Hero -->
	<section class="relative overflow-hidden">
		<!-- Background glow effects -->
		<div class="absolute inset-0 pointer-events-none">
			<div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
			<div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl"></div>
		</div>

		<div class="container mx-auto px-6 pt-24 pb-32 text-center relative z-10">
			<div class="badge badge-outline badge-primary mb-6 font-medium">AI-Powered Manga Creation</div>

			<h1 class="text-5xl md:text-7xl font-black leading-tight max-w-4xl mx-auto">
				Your stories deserve to be
				<span class="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
					seen
				</span>
			</h1>

			<p class="mt-6 text-lg md:text-xl text-base-content/60 max-w-2xl mx-auto leading-relaxed">
				Go from idea to illustrated manga in minutes. Define your story, let AI expand it into
				detailed scripts, then generate stunning panel-by-panel artwork.
			</p>

			<div class="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
				<a href="/register" class="btn btn-primary btn-lg gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd" />
					</svg>
					Start Creating — Free
				</a>
				<a href="#how-it-works" class="btn btn-ghost btn-lg">See How It Works</a>
			</div>

			<!-- Stats -->
			<div class="mt-16 flex flex-wrap justify-center gap-8 md:gap-16 text-base-content/50">
				<div>
					<div class="text-3xl font-bold text-base-content">4 Phases</div>
					<div class="text-sm mt-1">Structured Pipeline</div>
				</div>
				<div class="divider divider-horizontal"></div>
				<div>
					<div class="text-3xl font-bold text-base-content">AI-Driven</div>
					<div class="text-sm mt-1">Script & Art Generation</div>
				</div>
				<div class="divider divider-horizontal"></div>
				<div>
					<div class="text-3xl font-bold text-base-content">Any Style</div>
					<div class="text-sm mt-1">Manga, Manhwa, Webtoon</div>
				</div>
			</div>
		</div>
	</section>

	<!-- How It Works -->
	<section id="how-it-works" class="bg-base-200 py-24">
		<div class="container mx-auto px-6">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-5xl font-bold">From idea to manga in four steps</h2>
				<p class="mt-4 text-base-content/60 max-w-xl mx-auto">
					Our structured pipeline guides you through every stage of creation.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<!-- Step 1 -->
				<div class="card bg-base-300 border border-base-content/5 hover:border-primary/30 transition-colors">
					<div class="card-body">
						<div class="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-2">
							<span class="text-primary font-bold text-xl">1</span>
						</div>
						<h3 class="card-title text-lg">Define</h3>
						<p class="text-base-content/60 text-sm">
							Set your title, genre, synopsis, characters, locations, and art style. Build the foundation of your world.
						</p>
					</div>
				</div>

				<!-- Step 2 -->
				<div class="card bg-base-300 border border-base-content/5 hover:border-secondary/30 transition-colors">
					<div class="card-body">
						<div class="w-12 h-12 rounded-lg bg-secondary/15 flex items-center justify-center mb-2">
							<span class="text-secondary font-bold text-xl">2</span>
						</div>
						<h3 class="card-title text-lg">Refine</h3>
						<p class="text-base-content/60 text-sm">
							AI expands your synopsis into a full story. Generate character reference sheets and scene descriptions.
						</p>
					</div>
				</div>

				<!-- Step 3 -->
				<div class="card bg-base-300 border border-base-content/5 hover:border-accent/30 transition-colors">
					<div class="card-body">
						<div class="w-12 h-12 rounded-lg bg-accent/15 flex items-center justify-center mb-2">
							<span class="text-accent font-bold text-xl">3</span>
						</div>
						<h3 class="card-title text-lg">Script</h3>
						<p class="text-base-content/60 text-sm">
							Chapters split into panels. AI writes detailed scripts and generates image prompts you can review and edit.
						</p>
					</div>
				</div>

				<!-- Step 4 -->
				<div class="card bg-base-300 border border-base-content/5 hover:border-success/30 transition-colors">
					<div class="card-body">
						<div class="w-12 h-12 rounded-lg bg-success/15 flex items-center justify-center mb-2">
							<span class="text-success font-bold text-xl">4</span>
						</div>
						<h3 class="card-title text-lg">Generate</h3>
						<p class="text-base-content/60 text-sm">
							Bulk image generation brings your panels to life. Review, regenerate, and assemble your finished manga.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features -->
	<section class="py-24">
		<div class="container mx-auto px-6">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-5xl font-bold">Everything you need to create</h2>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
				<div class="text-center">
					<div class="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
						</svg>
					</div>
					<h3 class="font-bold text-lg mb-2">AI Story Expansion</h3>
					<p class="text-base-content/60 text-sm">
						Feed in a synopsis — get back a fully structured story with chapter breakdowns, character arcs, and pacing.
					</p>
				</div>

				<div class="text-center">
					<div class="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</div>
					<h3 class="font-bold text-lg mb-2">Character Sheets</h3>
					<p class="text-base-content/60 text-sm">
						Generate detailed visual reference sheets for every character. Maintain consistency across all your panels.
					</p>
				</div>

				<div class="text-center">
					<div class="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<h3 class="font-bold text-lg mb-2">Bulk Generation</h3>
					<p class="text-base-content/60 text-sm">
						Generate entire chapters of panel artwork at once. Review results, regenerate any panel, and pick the best versions.
					</p>
				</div>

				<div class="text-center">
					<div class="w-14 h-14 rounded-2xl bg-info/10 flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
						</svg>
					</div>
					<h3 class="font-bold text-lg mb-2">Style Presets</h3>
					<p class="text-base-content/60 text-sm">
						Choose from curated art styles — dark manhwa, soft shojo watercolor, bold shonen — or craft your own.
					</p>
				</div>

				<div class="text-center">
					<div class="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
					</div>
					<h3 class="font-bold text-lg mb-2">Full Control</h3>
					<p class="text-base-content/60 text-sm">
						Edit any AI-generated prompt, script, or description. You stay in the driver's seat at every step.
					</p>
				</div>

				<div class="text-center">
					<div class="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
						</svg>
					</div>
					<h3 class="font-bold text-lg mb-2">Reader Mode</h3>
					<p class="text-base-content/60 text-sm">
						Share your manga publicly or via private links. Readers get a smooth vertical-scroll experience.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Pricing -->
	<section class="bg-base-200 py-24">
		<div class="container mx-auto px-6">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-5xl font-bold">Simple, creator-friendly pricing</h2>
				<p class="mt-4 text-base-content/60">Start free. Scale as you create.</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
				<!-- Free -->
				<div class="card bg-base-300 border border-base-content/5">
					<div class="card-body">
						<h3 class="font-bold text-lg">Free</h3>
						<div class="mt-2">
							<span class="text-4xl font-black">$0</span>
							<span class="text-base-content/50">/mo</span>
						</div>
						<p class="text-sm text-base-content/50 mt-1">50 credits/month</p>
						<ul class="mt-4 space-y-2 text-sm text-base-content/70">
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								1 story
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								AI story expansion
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								Watermarked exports
							</li>
						</ul>
						<div class="card-actions mt-6">
							<a href="/register" class="btn btn-outline btn-sm w-full">Get Started</a>
						</div>
					</div>
				</div>

				<!-- Starter -->
				<div class="card bg-base-300 border border-base-content/5">
					<div class="card-body">
						<h3 class="font-bold text-lg">Starter</h3>
						<div class="mt-2">
							<span class="text-4xl font-black">$12</span>
							<span class="text-base-content/50">/mo</span>
						</div>
						<p class="text-sm text-base-content/50 mt-1">500 credits/month</p>
						<ul class="mt-4 space-y-2 text-sm text-base-content/70">
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								3 stories
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								No watermark
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								PDF export
							</li>
						</ul>
						<div class="card-actions mt-6">
							<a href="/register" class="btn btn-outline btn-sm w-full">Start Trial</a>
						</div>
					</div>
				</div>

				<!-- Pro (highlighted) -->
				<div class="card bg-base-300 border-2 border-primary relative">
					<div class="badge badge-primary absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</div>
					<div class="card-body">
						<h3 class="font-bold text-lg">Pro</h3>
						<div class="mt-2">
							<span class="text-4xl font-black text-primary">$29</span>
							<span class="text-base-content/50">/mo</span>
						</div>
						<p class="text-sm text-base-content/50 mt-1">1,500 credits/month</p>
						<ul class="mt-4 space-y-2 text-sm text-base-content/70">
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								Unlimited stories
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								Priority generation queue
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								Bulk generation
							</li>
						</ul>
						<div class="card-actions mt-6">
							<a href="/register" class="btn btn-primary btn-sm w-full">Go Pro</a>
						</div>
					</div>
				</div>

				<!-- Studio -->
				<div class="card bg-base-300 border border-base-content/5">
					<div class="card-body">
						<h3 class="font-bold text-lg">Studio</h3>
						<div class="mt-2">
							<span class="text-4xl font-black">$59</span>
							<span class="text-base-content/50">/mo</span>
						</div>
						<p class="text-sm text-base-content/50 mt-1">4,000 credits/month</p>
						<ul class="mt-4 space-y-2 text-sm text-base-content/70">
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								Everything in Pro
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								API access
							</li>
							<li class="flex gap-2 items-center">
								<svg class="w-4 h-4 text-success shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
								Team sharing
							</li>
						</ul>
						<div class="card-actions mt-6">
							<a href="/register" class="btn btn-outline btn-sm w-full">Contact Us</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="py-24">
		<div class="container mx-auto px-6 text-center">
			<div class="max-w-2xl mx-auto">
				<h2 class="text-3xl md:text-5xl font-bold">Ready to forge your first manga?</h2>
				<p class="mt-4 text-base-content/60 text-lg">
					Join creators who are turning their stories into illustrated manga with the power of AI.
				</p>
				<a href="/register" class="btn btn-primary btn-lg mt-8">Start Creating — It's Free</a>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-base-300 py-10">
		<div class="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-base-content/40">
			<div>
				<span class="font-bold text-base-content/60">MangaForge</span> — AI-powered manga creation
			</div>
			<div class="flex gap-6">
				<a href="/browse" class="hover:text-base-content transition-colors">Browse</a>
				<a href="/billing" class="hover:text-base-content transition-colors">Pricing</a>
			</div>
		</div>
	</footer>
</div>
