import { db } from '$lib/server/db';
import { userCredits } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

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
