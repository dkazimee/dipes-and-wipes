import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { z } from "zod";
import { db } from "@workspace/db";
import { subscriptionsTable, productsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { getUncachableStripeClient } from "../stripeClient";
import {
  getOrCreateStripeCustomer,
  getStripeCustomerId,
  listPaymentsForCustomer,
} from "../stripeStorage";

const router = Router();

const baseUrl = () =>
  process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "http://localhost:80";

// Map frequency (days) to Stripe recurring interval metadata
function frequencyDaysKey(frequencyStr: string): string {
  const days = Number(frequencyStr);
  if (!isNaN(days)) return String(days);
  // Handle legacy string values
  if (frequencyStr === "bimonthly") return "14";
  return "30";
}

// ── POST /stripe/checkout/subscription ────────────────────────────────────────
router.post("/checkout/subscription", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const schema = z.object({
    subscriptionId: z.number().int().positive(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { subscriptionId } = parsed.data;

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscriptionId));
  if (!sub) return res.status(404).json({ error: "Subscription not found" });

  const brand = sub.brand;
  if (!brand) {
    return res.status(400).json({ error: "Subscription has no diaper brand set" });
  }

  const freqKey = frequencyDaysKey(sub.frequency);

  // Look up the Stripe recurring price matching brand + frequency
  const stripe = await getUncachableStripeClient();
  const prices = await stripe.prices.search({
    query: `metadata["dipes_brand"]:"${brand}" AND metadata["frequency_days"]:"${freqKey}" AND active:"true"`,
    limit: 1,
  });

  if (prices.data.length === 0) {
    return res.status(400).json({
      error: `No Stripe price found for brand "${brand}" with frequency ${freqKey} days. Run the stripe-seed script first.`,
    });
  }

  const priceId = prices.data[0].id;

  const user = await clerkClient.users.getUser(userId);
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? "";
  const customerId = await getOrCreateStripeCustomer(userId, email);

  const base = baseUrl();
  const successUrl =
    parsed.data.successUrl ??
    `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}&subscription_id=${subscriptionId}`;
  const cancelUrl =
    parsed.data.cancelUrl ??
    `${base}/checkout/cancel?subscription_id=${subscriptionId}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { subscriptionId: String(subscriptionId), userId },
  });

  await db
    .update(subscriptionsTable)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(subscriptionsTable.id, subscriptionId));

  return res.json({ url: session.url });
});

// ── POST /stripe/checkout/one-time ────────────────────────────────────────────
router.post("/checkout/one-time", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const itemSchema = z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1) });
  const schema = z.object({
    items: z.array(itemSchema).min(1),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { items } = parsed.data;

  // Fetch products from DB
  const productIds = items.map((i) => i.productId);
  const products = await db.select().from(productsTable).where(inArray(productsTable.id, productIds));

  if (products.length === 0) return res.status(400).json({ error: "No valid products found" });

  const productMap = new Map(products.map((p) => [p.id, p]));

  const lineItems = items.flatMap((item) => {
    const product = productMap.get(item.productId);
    if (!product) return [];
    const unitAmount = Math.round(product.price * 100);
    return [{
      price_data: {
        currency: "usd",
        product_data: {
          name: product.name,
          ...(product.description ? { description: product.description } : {}),
        },
        unit_amount: unitAmount,
      },
      quantity: item.quantity,
    }];
  });

  if (lineItems.length === 0) return res.status(400).json({ error: "No valid line items" });

  const user = await clerkClient.users.getUser(userId);
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? "";
  const customerId = await getOrCreateStripeCustomer(userId, email);

  const stripe = await getUncachableStripeClient();
  const base = baseUrl();
  const successUrl = parsed.data.successUrl ?? `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = parsed.data.cancelUrl ?? `${base}/checkout/cancel`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });

  return res.json({ url: session.url });
});

// ── POST /stripe/refund (admin) ────────────────────────────────────────────────
router.post("/refund", requireAdmin, async (req, res) => {
  const schema = z.object({
    paymentIntentId: z.string().min(1),
    amountCents: z.number().int().positive().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const stripe = await getUncachableStripeClient();
  const refund = await stripe.refunds.create({
    payment_intent: parsed.data.paymentIntentId,
    ...(parsed.data.amountCents ? { amount: parsed.data.amountCents } : {}),
  });

  return res.json({ refundId: refund.id, status: refund.status });
});

// ── GET /stripe/payments (current user) ────────────────────────────────────────
router.get("/payments", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const customerId = await getStripeCustomerId(userId);
  if (!customerId) return res.json([]);

  const payments = await listPaymentsForCustomer(customerId);
  return res.json(payments);
});

// ── GET /stripe/payments/:userId (admin) ───────────────────────────────────────
router.get("/payments/:userId", requireAdmin, async (req, res) => {
  const userId = req.params["userId"] as string;
  const customerId = await getStripeCustomerId(userId);
  if (!customerId) return res.json([]);

  const payments = await listPaymentsForCustomer(customerId);
  return res.json(payments);
});

export default router;
