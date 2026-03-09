/**
 * Landing page server load.
 * Fetches all active products from Polar, separates them into subscriptions
 * (recurring, sorted by price) and credit packs (one-time), and serializes
 * them for the pricing section display.
 */
import { polarClient } from '$lib/server/polar';

export async function load({ locals }) {
	const { result } = await polarClient.products.list({
		isArchived: false,
		limit: 20
	});

	const subscriptions = result.items
		.filter((p) => p.isRecurring)
		.sort((a, b) => {
			const priceA = getFixedPrice(a.prices);
			const priceB = getFixedPrice(b.prices);
			return priceA - priceB;
		});

	const creditPacks = result.items.filter((p) => !p.isRecurring);

	return {
		subscriptions: subscriptions.map(serializeProduct),
		creditPacks: creditPacks.map(serializeProduct),
		isAuthenticated: !!locals.user
	};
}

/** Extract the fixed price amount (in cents) from a Polar product's prices array. */
function getFixedPrice(prices: { amountType: string; priceAmount?: number }[]) {
	const fixed = prices.find((p) => p.amountType === 'fixed');
	return fixed && 'priceAmount' in fixed ? (fixed.priceAmount as number) : 0;
}

type PolarProduct = Awaited<
	ReturnType<typeof polarClient.products.list>
>['result']['items'][number];

/** Convert a Polar product to a plain object with just the fields the frontend needs. */
function serializeProduct(product: PolarProduct) {
	const fixedPrice = product.prices.find((p) => p.amountType === 'fixed');
	return {
		id: product.id,
		name: product.name,
		description: product.description,
		isRecurring: product.isRecurring,
		credits: Number(product.metadata?.credits ?? 0),
		priceAmount: fixedPrice && 'priceAmount' in fixedPrice ? fixedPrice.priceAmount : 0,
		priceCurrency: fixedPrice && 'priceCurrency' in fixedPrice ? fixedPrice.priceCurrency : 'usd'
	};
}
