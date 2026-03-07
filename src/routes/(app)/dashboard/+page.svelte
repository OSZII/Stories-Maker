<script lang="ts">
	let { data } = $props();
</script>

<div class="max-w-4xl p-8">
	<h1 class="mb-8 text-3xl font-bold">Dashboard</h1>

	<!-- Credits Overview -->
	<div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body">
				<div class="text-sm text-base-content/50">Subscription Plan</div>
				<div class="text-2xl font-bold text-primary">{data.credits.planName}</div>
				<a href="/dashboard/billing" class="mt-1 link text-xs link-primary">Manage billing</a>
			</div>
		</div>
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body">
				<div class="text-sm text-base-content/50">Monthly Credits</div>
				<div class="text-2xl font-bold">{data.credits.subscriptionCredits}</div>
				<div class="text-xs text-base-content/40">Resets each billing cycle</div>
			</div>
		</div>
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body">
				<div class="text-sm text-base-content/50">Credit Pack Credits</div>
				<div class="text-2xl font-bold text-success">{data.credits.purchasedCredits}</div>
				<div class="text-xs text-base-content/40">Never expire</div>
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="card border border-base-300 bg-base-200">
		<div class="card-body">
			<h2 class="card-title text-lg">Quick Actions</h2>
			<div class="mt-2 flex gap-3">
				<a href="/dashboard/projects" class="btn btn-sm btn-primary">View Projects</a>
				<a href="/dashboard/projects?action=new" class="btn btn-outline btn-sm"
					>Create New Project</a
				>
			</div>
		</div>
	</div>
</div>
