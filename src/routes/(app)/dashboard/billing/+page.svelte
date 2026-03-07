<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { addToast } from '$lib/stores/toast.svelte';

	let { data } = $props();
	let loading = $state(false);

	async function openCustomerPortal() {
		loading = true;
		try {
			const result = await authClient.customer.portal();
			if (result.data?.url) {
				window.location.href = result.data.url;
			}
		} catch (err) {
			addToast('Could not open billing portal. Please try again.', 'error');
		} finally {
			loading = false;
		}
	}
</script>

<div class="max-w-4xl p-8">
	<h1 class="mb-8 text-3xl font-bold">Billing</h1>

	<!-- Current Plan -->
	<div class="card mb-6 border border-base-300 bg-base-200">
		<div class="card-body">
			<h2 class="card-title text-lg">Current Plan</h2>
			<div class="mt-2 flex items-center gap-4">
				<div class="text-3xl font-black text-primary">{data.credits.planName}</div>
				<button class="btn btn-outline btn-sm" onclick={openCustomerPortal} disabled={loading}>
					{#if loading}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					Manage Subscription
				</button>
			</div>
		</div>
	</div>

	<!-- Credits -->
	<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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

	<!-- Actions -->
	<div class="card border border-base-300 bg-base-200">
		<div class="card-body">
			<h2 class="card-title text-lg">Billing Portal</h2>
			<p class="mt-1 text-sm text-base-content/60">
				Manage your subscription, update payment methods, view invoices, and purchase credit packs.
			</p>
			<div class="mt-4 card-actions">
				<button class="btn btn-sm btn-primary" onclick={openCustomerPortal} disabled={loading}>
					{#if loading}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					Open Billing Portal
				</button>
				<a href="/" class="btn btn-outline btn-sm">View Plans</a>
			</div>
		</div>
	</div>
</div>
