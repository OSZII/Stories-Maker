import { db } from '$lib/server/db';
import { userCredits } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Fetch a user's credit balances and plan name for display purposes.
 * Auto-creates a default userCredits row (Free plan, 50 subscription credits) if none exists.
 */
export async function getUserCredits(userId: string) {
	let credits = await db.query.userCredits.findFirst({
		where: eq(userCredits.userId, userId)
	});

	if (!credits) {
		const [created] = await db.insert(userCredits).values({ userId }).returning();
		credits = created;
	}

	return {
		subscriptionCredits: credits.subscriptionCredits,
		purchasedCredits: credits.purchasedCredits,
		planName: credits.planName
	};
}
