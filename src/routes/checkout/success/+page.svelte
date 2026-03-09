<!-- Checkout success confirmation — shows the user's name and purchased product name with a link to dashboard. -->
<script lang="ts">
	let { data } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-base-100 px-6">
	<div class="card w-full max-w-md border border-base-content/5 bg-base-300">
		<div class="card-body items-center text-center">
			<div class="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-8 w-8 text-success"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>

			<h1 class="mt-2 text-2xl font-bold">You're all set, {data.userName}!</h1>
			<p class="mt-2 text-base-content/60">
				Your <span class="font-semibold text-primary">{data.productName}</span> plan is now active.
			</p>

			<div class="mt-6 card-actions w-full">
				<a href="/dashboard" class="btn w-full btn-primary">Go to Dashboard</a>
			</div>
		</div>
	</div>
</div>
