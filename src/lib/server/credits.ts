/**
 * Credit system — manages the two-pool credit model (subscription + purchased).
 * Provides check, reserve (debit), and refund operations with full ledger tracking.
 */
import { db } from '$lib/server/db';
import { userCredits, creditLedger } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Check if a user has enough total credits (subscription + purchased).
 * Auto-creates a userCredits row with defaults if one doesn't exist yet.
 */
export async function checkSufficientCredits(userId: string, required: number) {
	let credits = await db.query.userCredits.findFirst({
		where: eq(userCredits.userId, userId)
	});

	if (!credits) {
		const [created] = await db.insert(userCredits).values({ userId }).returning();
		credits = created;
	}

	const available = credits.subscriptionCredits + credits.purchasedCredits;
	return { sufficient: available >= required, available };
}

/**
 * Debit credits from a user's balance. Draws from subscription credits first
 * (they expire monthly), then purchased credits. Creates ledger entries for each pool.
 * Throws if user doesn't have enough credits.
 */
export async function reserveCredits(
	userId: string,
	amount: number,
	reason: string,
	referenceId?: string
) {
	const credits = await db.query.userCredits.findFirst({
		where: eq(userCredits.userId, userId)
	});
	if (!credits) throw new Error('User credits not found');

	const total = credits.subscriptionCredits + credits.purchasedCredits;
	if (total < amount) throw new Error('Insufficient credits');

	// Deduct subscription credits first (they expire), then purchased
	const fromSubscription = Math.min(credits.subscriptionCredits, amount);
	const fromPurchased = amount - fromSubscription;

	const newSubCredits = credits.subscriptionCredits - fromSubscription;
	const newPurchasedCredits = credits.purchasedCredits - fromPurchased;

	await db
		.update(userCredits)
		.set({
			subscriptionCredits: newSubCredits,
			purchasedCredits: newPurchasedCredits
		})
		.where(eq(userCredits.userId, userId));

	// Create ledger entries for each pool used
	if (fromSubscription > 0) {
		await db.insert(creditLedger).values({
			userId,
			amount: -fromSubscription,
			creditType: 'subscription',
			balanceAfterSubscription: newSubCredits,
			balanceAfterPurchased: newPurchasedCredits,
			reason,
			referenceId
		});
	}

	if (fromPurchased > 0) {
		await db.insert(creditLedger).values({
			userId,
			amount: -fromPurchased,
			creditType: 'purchased',
			balanceAfterSubscription: newSubCredits,
			balanceAfterPurchased: newPurchasedCredits,
			reason,
			referenceId
		});
	}
}

/**
 * Refund credits back to a user. If a referenceId is provided, looks up the
 * original ledger entries to proportionally refund to the correct pools.
 * Falls back to refunding to purchased credits if no reference is found.
 */
export async function refundCredits(
	userId: string,
	amount: number,
	reason: string,
	referenceId?: string
) {
	const credits = await db.query.userCredits.findFirst({
		where: eq(userCredits.userId, userId)
	});
	if (!credits) throw new Error('User credits not found');

	// Look up original ledger entries to determine pool split
	let refundToSubscription = 0;
	let refundToPurchased = 0;

	if (referenceId) {
		const originalEntries = await db
			.select()
			.from(creditLedger)
			.where(eq(creditLedger.referenceId, referenceId));

		let subscriptionDeducted = 0;
		let purchasedDeducted = 0;
		for (const entry of originalEntries) {
			if (entry.amount < 0) {
				if (entry.creditType === 'subscription') subscriptionDeducted += Math.abs(entry.amount);
				else purchasedDeducted += Math.abs(entry.amount);
			}
		}

		const totalDeducted = subscriptionDeducted + purchasedDeducted;
		if (totalDeducted > 0) {
			// Proportional refund to each pool
			refundToSubscription = Math.round((subscriptionDeducted / totalDeducted) * amount);
			refundToPurchased = amount - refundToSubscription;
		} else {
			// Fallback: refund to purchased (safer, doesn't expire)
			refundToPurchased = amount;
		}
	} else {
		refundToPurchased = amount;
	}

	const newSubCredits = credits.subscriptionCredits + refundToSubscription;
	const newPurchasedCredits = credits.purchasedCredits + refundToPurchased;

	await db
		.update(userCredits)
		.set({
			subscriptionCredits: newSubCredits,
			purchasedCredits: newPurchasedCredits
		})
		.where(eq(userCredits.userId, userId));

	if (refundToSubscription > 0) {
		await db.insert(creditLedger).values({
			userId,
			amount: refundToSubscription,
			creditType: 'subscription',
			balanceAfterSubscription: newSubCredits,
			balanceAfterPurchased: newPurchasedCredits,
			reason,
			referenceId
		});
	}

	if (refundToPurchased > 0) {
		await db.insert(creditLedger).values({
			userId,
			amount: refundToPurchased,
			creditType: 'purchased',
			balanceAfterSubscription: newSubCredits,
			balanceAfterPurchased: newPurchasedCredits,
			reason,
			referenceId
		});
	}
}
