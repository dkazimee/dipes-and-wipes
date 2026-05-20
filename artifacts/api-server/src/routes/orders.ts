import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { ordersTable, subscriptionsTable, babiesTable, productsTable, approvedSkusTable } from "@workspace/db";
import { eq, inArray, and, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  getMcfOrder,
  mapMcfStatus,
  extractTrackingNumber,
} from "../services/fulfillment/amazon-mcf";
import { tryAutoFulfillMcf } from "../services/subscriptions/auto-fulfill";
import { sendOrderConfirmation } from "../services/notifications/email";

const router = Router();

function formatOrder(order: typeof ordersTable.$inferSelect & { babyId?: number | null; babyName?: string | null }) {
  return {
    id: order.id,
    subscriptionId: order.subscriptionId,
    babyId: order.babyId ?? null,
    babyName: order.babyName ?? null,
    status: order.status,
    scheduledDate: order.scheduledDate,
    diaperSize: order.diaperSize ?? null,
    totalCents: order.totalCents ?? null,
    trackingNumber: order.trackingNumber ?? null,
    carrier: order.carrier ?? null,
    fulfillmentProvider: order.fulfillmentProvider ?? null,
    fulfillmentId: order.fulfillmentId ?? null,
    fulfillmentStatus: order.fulfillmentStatus ?? null,
    fulfillmentErrorMessage: order.fulfillmentErrorMessage ?? null,
    shippingName: order.shippingName ?? null,
    shippingAddress1: order.shippingAddress1 ?? null,
    shippingCity: order.shippingCity ?? null,
    shippingState: order.shippingState ?? null,
    shippingZip: order.shippingZip ?? null,
    shippingCountry: order.shippingCountry ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

async function buildOrder(order: typeof ordersTable.$inferSelect) {
  if (!order.subscriptionId) return formatOrder({ ...order, babyId: null, babyName: null });
  const [sub] = await db.select({ babyId: subscriptionsTable.babyId }).from(subscriptionsTable).where(eq(subscriptionsTable.id, order.subscriptionId));
  const babyId = sub?.babyId ?? null;
  let babyName: string | null = null;
  if (babyId) {
    const [baby] = await db.select({ name: babiesTable.name }).from(babiesTable).where(eq(babiesTable.id, babyId));
    babyName = baby?.name ?? null;
  }
  return formatOrder({ ...order, babyId, babyName });
}

async function getUserSubIds(userId: string): Promise<number[]> {
  const userBabies = await db.select({ id: babiesTable.id }).from(babiesTable).where(eq(babiesTable.userId, userId));
  const babyIds = userBabies.map(b => b.id);
  if (babyIds.length === 0) return [];
  const userSubs = await db.select({ id: subscriptionsTable.id }).from(subscriptionsTable).where(inArray(subscriptionsTable.babyId, babyIds));
  return userSubs.map(s => s.id);
}

router.get("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const subIds = await getUserSubIds(userId);
  const whereClause = subIds.length > 0
    ? or(inArray(ordersTable.subscriptionId, subIds), eq(ordersTable.userId, userId))
    : eq(ordersTable.userId, userId);
  const orders = await db.select().from(ordersTable).where(whereClause).orderBy(ordersTable.scheduledDate);
  const results = await Promise.all(orders.map(buildOrder));
  res.json(results);
});

// ── One-time purchase (no subscription required) ─────────────────────────────

const oneTimePurchaseSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  diaperSize: z.string().optional(),
  scheduledDate: z.string(),
  shippingName: z.string().min(1),
  shippingAddress1: z.string().min(1),
  shippingCity: z.string().min(1),
  shippingState: z.string().min(1),
  shippingZip: z.string().min(1),
  shippingCountry: z.string().default("US"),
});

router.post("/one-time", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const parsed = oneTimePurchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const data = parsed.data;
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, data.productId));
  if (!product) return res.status(404).json({ error: "Product not found" });

  const unitCents = product.unitPriceCents ?? Math.round(product.price * 100);
  const totalCents = unitCents * data.quantity;

  const [order] = await db.insert(ordersTable).values({
    subscriptionId: null,
    userId,
    scheduledDate: data.scheduledDate,
    status: "pending",
    diaperSize: data.diaperSize ?? null,
    totalCents,
    shippingName: data.shippingName,
    shippingAddress1: data.shippingAddress1,
    shippingCity: data.shippingCity,
    shippingState: data.shippingState,
    shippingZip: data.shippingZip,
    shippingCountry: data.shippingCountry,
  }).returning();

  // Send order confirmation email (fire-and-forget)
  clerkClient.users.getUser(userId).then(clerkUser => {
    const email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress;
    if (email) {
      const name = clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName ?? ""}`.trim() : email;
      return sendOrderConfirmation({
        to: email,
        customerName: name,
        orderId: order.id,
        scheduledDate: order.scheduledDate,
        diaperSize: order.diaperSize,
        totalCents: order.totalCents,
        shippingName: order.shippingName,
        shippingAddress1: order.shippingAddress1,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingZip: order.shippingZip,
      });
    }
  }).catch(err => req.log.error({ err }, "Failed to send order confirmation email"));

  res.status(201).json(formatOrder({ ...order, babyId: null, babyName: null }));
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return res.status(404).json({ error: "Not found" });
  // One-time orders are owned by userId directly; subscription orders via baby chain
  const isOwnOneTime = !order.subscriptionId && order.userId === userId;
  if (!isOwnOneTime) {
    const subIds = await getUserSubIds(userId);
    if (!order.subscriptionId || !subIds.includes(order.subscriptionId)) return res.status(404).json({ error: "Not found" });
  }
  res.json(await buildOrder(order));
});

// ── Amazon MCF endpoints ─────────────────────────────────────────────────────

/**
 * Validate a cart (list of {productId, quantity} pairs) against the active
 * Amazon MCF SKU whitelist before committing to an order.
 *
 * NOTE: This route must be registered before /:id routes so that
 * "validate-amazon" is not interpreted as a numeric ID.
 */
const validateAmazonCartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
});

router.post("/validate-amazon", async (req, res) => {
  const parsed = validateAmazonCartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { items } = parsed.data;
  const productIds = items.map(i => i.productId);

  // Single query: join products with approved_skus to validate the full whitelist
  const rows = await db
    .select({
      productId: productsTable.id,
      productName: productsTable.name,
      internalSku: productsTable.sku,
      // approved_skus columns — null when no approved row exists
      approvedSkuId: approvedSkusTable.id,
      active: approvedSkusTable.active,
      // amazonSellerSku is NOT included in the response — only used for fulfillment
      maxQuantityPerOrder: approvedSkusTable.maxQuantityPerOrder,
    })
    .from(productsTable)
    .leftJoin(approvedSkusTable, eq(productsTable.sku, approvedSkusTable.internalSku))
    .where(inArray(productsTable.id, productIds));

  const productMap = new Map(rows.map(r => [r.productId, r]));

  const validItems: { productId: number; name: string; quantity: number }[] = [];
  const invalidItems: { productId: number; reason: string }[] = [];

  for (const item of items) {
    const row = productMap.get(item.productId);
    if (!row) {
      invalidItems.push({ productId: item.productId, reason: "Product not found" });
      continue;
    }
    if (row.approvedSkuId == null) {
      invalidItems.push({ productId: item.productId, reason: `"${row.productName}" is not available for Amazon fulfillment` });
      continue;
    }
    if (!row.active) {
      invalidItems.push({ productId: item.productId, reason: `"${row.productName}" is no longer available` });
      continue;
    }
    if (row.maxQuantityPerOrder != null && item.quantity > row.maxQuantityPerOrder) {
      invalidItems.push({
        productId: item.productId,
        reason: `"${row.productName}" exceeds the maximum quantity of ${row.maxQuantityPerOrder} per order`,
      });
      continue;
    }
    validItems.push({ productId: item.productId, name: row.productName, quantity: item.quantity });
  }

  res.json({
    valid: invalidItems.length === 0,
    validItems,
    invalidItems,
  });
});

const fulfillAmazonSchema = z.object({
  shippingName: z.string().optional(),
  shippingAddress1: z.string().optional(),
  shippingCity: z.string().optional(),
  shippingState: z.string().optional(),
  shippingZip: z.string().optional(),
  shippingCountry: z.string().optional(),
  shippingEmail: z.string().email().optional(),
  /** "Standard" | "Expedited" | "Priority" — defaults to "Standard" */
  shippingSpeed: z.enum(["Standard", "Expedited", "Priority"]).optional(),
});

router.post("/:id/fulfill-amazon", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = fulfillAmazonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await tryAutoFulfillMcf(id, {
    shippingSpeed: parsed.data.shippingSpeed,
    addressOverride: {
      shippingName:     parsed.data.shippingName,
      shippingAddress1: parsed.data.shippingAddress1,
      shippingCity:     parsed.data.shippingCity,
      shippingState:    parsed.data.shippingState,
      shippingZip:      parsed.data.shippingZip,
      shippingCountry:  parsed.data.shippingCountry,
    },
  });

  if (result.skipped) {
    if (result.skipCode === "not_found")        return res.status(404).json({ error: "Not found" });
    if (result.skipCode === "already_submitted") return res.status(409).json({ error: result.skipReason });
    // no_address, no_items → 422
    return res.status(422).json({ error: result.skipReason });
  }

  if (!result.success) {
    return res.status(422).json({ error: result.error });
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  res.json(await buildOrder(order!));
});

router.post("/:id/sync-amazon", async (req, res) => {
  const id = Number(req.params.id);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) return res.status(404).json({ error: "Not found" });
  if (order.fulfillmentProvider !== "amazon-mcf" || !order.fulfillmentId) {
    return res.status(422).json({ error: "Order has not been submitted to Amazon MCF" });
  }

  const mcfOrder = await getMcfOrder(order.fulfillmentId);
  const newStatus = mapMcfStatus(mcfOrder.fulfillmentOrderStatus);
  const trackingNumber = extractTrackingNumber(mcfOrder) ?? order.trackingNumber;

  const [updated] = await db
    .update(ordersTable)
    .set({
      fulfillmentStatus: mcfOrder.fulfillmentOrderStatus,
      status: newStatus,
      trackingNumber,
    })
    .where(eq(ordersTable.id, id))
    .returning();

  res.json(await buildOrder(updated));
});

/**
 * POST /orders/process-pending
 *
 * Batch processor: attempt Amazon MCF auto-fulfillment for every pending order.
 * By default only processes orders with status="pending" and no fulfillmentId.
 * Pass `?retry=true` to also retry orders stuck in status="fulfillment_error".
 *
 * Designed to be called by a cron job (e.g. nightly) or manually by an admin.
 */
router.post("/process-pending", async (req, res) => {
  const retryErrors = req.query.retry === "true";

  const statusFilter = retryErrors
    ? or(
        and(eq(ordersTable.status, "pending"), isNull(ordersTable.fulfillmentId)),
        eq(ordersTable.status, "fulfillment_error")
      )
    : and(eq(ordersTable.status, "pending"), isNull(ordersTable.fulfillmentId));

  const pendingOrders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(statusFilter);

  const results = await Promise.all(
    pendingOrders.map(({ id }) => tryAutoFulfillMcf(id))
  );

  const succeeded = results.filter(r => r.success).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success && !r.skipped).length;

  res.json({
    processed: results.length,
    succeeded,
    skipped,
    failed,
    results: results.map(r => ({
      orderId: r.orderId,
      success: r.success,
      skipped: r.skipped,
      ...(r.skipReason ? { skipReason: r.skipReason } : {}),
      ...(r.error ? { error: r.error } : {}),
    })),
  });
});

export default router;
