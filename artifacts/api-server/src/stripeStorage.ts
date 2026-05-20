import { db } from "@workspace/db";
import { customerProfilesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";

export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const [profile] = await db
    .select()
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, userId));

  if (profile?.stripeCustomerId) {
    return profile.stripeCustomerId;
  }

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({ email, metadata: { userId } });

  await db
    .insert(customerProfilesTable)
    .values({ userId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: customerProfilesTable.userId,
      set: { stripeCustomerId: customer.id },
    });

  return customer.id;
}

export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const [profile] = await db
    .select()
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, userId));
  return profile?.stripeCustomerId ?? null;
}

export async function listPaymentsForCustomer(stripeCustomerId: string) {
  try {
    const result = await db.execute(sql`
      SELECT
        pi.id,
        pi.amount,
        pi.currency,
        pi.status,
        pi.created,
        pi.metadata,
        pi.description
      FROM stripe.payment_intents pi
      WHERE pi.customer = ${stripeCustomerId}
      ORDER BY pi.created DESC
      LIMIT 50
    `);
    return result.rows as Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      created: number;
      metadata: Record<string, string> | null;
      description: string | null;
    }>;
  } catch {
    return [];
  }
}
