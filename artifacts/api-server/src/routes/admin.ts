import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { approvedSkusTable, APPROVED_CATEGORIES, babiesTable, ordersTable, subscriptionsTable, subscriptionItemsTable, productsTable } from "@workspace/db";
import { z } from "zod";
import { eq, inArray, desc, ne } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { searchCatalog, getCatalogItemWithVariants } from "../services/amazonCatalog";
import { sendShippingNotification } from "../services/emailService";

const router = Router();

// ── User management ───────────────────────────────────────────────────────────

router.get("/users", requireAdmin, async (_req, res) => {
  const { data: users, totalCount } = await clerkClient.users.getUserList({
    limit: 500,
    orderBy: "-created_at",
  });

  res.json({
    totalCount,
    users: users.map((u) => ({
      id: u.id,
      email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? null,
      firstName: u.firstName,
      lastName: u.lastName,
      imageUrl: u.imageUrl,
      createdAt: new Date(u.createdAt).toISOString(),
      lastSignInAt: u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null,
      banned: u.banned,
    })),
  });
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  await clerkClient.users.deleteUser(req.params.id);
  res.status(204).send();
});

/** Get a user's babies and orders for admin troubleshooting */
router.get("/users/:userId/details", requireAdmin, async (req, res) => {
  const { userId } = req.params;

  const babies = await db
    .select()
    .from(babiesTable)
    .where(eq(babiesTable.userId, userId))
    .orderBy(babiesTable.createdAt);

  const babyIds = babies.map((b) => b.id);

  const orders =
    babyIds.length === 0
      ? []
      : await db
          .select({
            id: ordersTable.id,
            subscriptionId: ordersTable.subscriptionId,
            babyId: babiesTable.id,
            babyName: babiesTable.name,
            status: ordersTable.status,
            scheduledDate: ordersTable.scheduledDate,
            diaperSize: ordersTable.diaperSize,
            totalCents: ordersTable.totalCents,
            trackingNumber: ordersTable.trackingNumber,
            fulfillmentStatus: ordersTable.fulfillmentStatus,
            fulfillmentErrorMessage: ordersTable.fulfillmentErrorMessage,
            createdAt: ordersTable.createdAt,
          })
          .from(ordersTable)
          .innerJoin(subscriptionsTable, eq(ordersTable.subscriptionId, subscriptionsTable.id))
          .innerJoin(babiesTable, eq(subscriptionsTable.babyId, babiesTable.id))
          .where(inArray(babiesTable.id, babyIds))
          .orderBy(desc(ordersTable.scheduledDate))
          .limit(50);

  res.json({ babies, orders });
});

// ── Order fulfillment ─────────────────────────────────────────────────────────

/** List all orders with user/baby context for the fulfillment dashboard */
router.get("/fulfillment/orders", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: ordersTable.id,
      subscriptionId: ordersTable.subscriptionId,
      directUserId: ordersTable.userId,
      status: ordersTable.status,
      scheduledDate: ordersTable.scheduledDate,
      diaperSize: ordersTable.diaperSize,
      totalCents: ordersTable.totalCents,
      trackingNumber: ordersTable.trackingNumber,
      carrier: ordersTable.carrier,
      fulfillmentProvider: ordersTable.fulfillmentProvider,
      fulfillmentId: ordersTable.fulfillmentId,
      fulfillmentStatus: ordersTable.fulfillmentStatus,
      fulfillmentErrorMessage: ordersTable.fulfillmentErrorMessage,
      shippingName: ordersTable.shippingName,
      shippingAddress1: ordersTable.shippingAddress1,
      shippingCity: ordersTable.shippingCity,
      shippingState: ordersTable.shippingState,
      shippingZip: ordersTable.shippingZip,
      createdAt: ordersTable.createdAt,
      babyId: babiesTable.id,
      babyName: babiesTable.name,
      babyUserId: babiesTable.userId,
    })
    .from(ordersTable)
    .leftJoin(subscriptionsTable, eq(ordersTable.subscriptionId, subscriptionsTable.id))
    .leftJoin(babiesTable, eq(subscriptionsTable.babyId, babiesTable.id))
    .where(ne(ordersTable.status, "cancelled"))
    .orderBy(desc(ordersTable.createdAt))
    .limit(300);

  const userIds = [...new Set(
    rows.map(r => r.directUserId ?? r.babyUserId).filter((id): id is string => !!id)
  )];

  const userMap = new Map<string, { email: string | null; name: string | null }>();
  if (userIds.length > 0) {
    const { data: clerkUsers } = await clerkClient.users.getUserList({ userId: userIds, limit: 500 });
    for (const u of clerkUsers) {
      userMap.set(u.id, {
        email: u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ?? null,
        name: u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : null,
      });
    }
  }

  const subscriptionIds = [...new Set(rows.map(r => r.subscriptionId).filter((id): id is number => id != null))];
  const itemsBySubId = new Map<number, { productId: number; productName: string; quantity: number; priceCents: number | null }[]>();
  if (subscriptionIds.length > 0) {
    const itemRows = await db
      .select({
        subscriptionId: subscriptionItemsTable.subscriptionId,
        productId: subscriptionItemsTable.productId,
        productName: productsTable.name,
        quantity: subscriptionItemsTable.quantity,
        priceCents: subscriptionItemsTable.priceCents,
      })
      .from(subscriptionItemsTable)
      .leftJoin(productsTable, eq(subscriptionItemsTable.productId, productsTable.id))
      .where(inArray(subscriptionItemsTable.subscriptionId, subscriptionIds));
    for (const item of itemRows) {
      const list = itemsBySubId.get(item.subscriptionId) ?? [];
      list.push({
        productId: item.productId,
        productName: item.productName ?? `Product #${item.productId}`,
        quantity: item.quantity,
        priceCents: item.priceCents,
      });
      itemsBySubId.set(item.subscriptionId, list);
    }
  }

  res.json(rows.map(r => {
    const userId = r.directUserId ?? r.babyUserId ?? null;
    const user = userId ? userMap.get(userId) : null;
    return {
      id: r.id,
      subscriptionId: r.subscriptionId ?? null,
      userId,
      userEmail: user?.email ?? null,
      userName: user?.name ?? null,
      babyId: r.babyId ?? null,
      babyName: r.babyName ?? null,
      status: r.status,
      scheduledDate: r.scheduledDate,
      diaperSize: r.diaperSize ?? null,
      totalCents: r.totalCents ?? null,
      trackingNumber: r.trackingNumber ?? null,
      carrier: r.carrier ?? null,
      fulfillmentProvider: r.fulfillmentProvider ?? null,
      fulfillmentId: r.fulfillmentId ?? null,
      fulfillmentStatus: r.fulfillmentStatus ?? null,
      fulfillmentErrorMessage: r.fulfillmentErrorMessage ?? null,
      shippingName: r.shippingName ?? null,
      shippingAddress1: r.shippingAddress1 ?? null,
      shippingCity: r.shippingCity ?? null,
      shippingState: r.shippingState ?? null,
      shippingZip: r.shippingZip ?? null,
      createdAt: r.createdAt.toISOString(),
      items: r.subscriptionId != null ? (itemsBySubId.get(r.subscriptionId) ?? []) : [],
    };
  }));
});

/** Admin: hard-delete an order from the fulfillment dashboard */
router.delete("/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"] as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const deleted = await db.delete(ordersTable).where(eq(ordersTable.id, id)).returning();
  if (deleted.length === 0) return res.status(404).json({ error: "Order not found" });
  return res.status(204).send();
});

const shipOrderSchema = z.object({
  trackingNumber: z.string().min(1),
  carrier: z.string().min(1),
});

/** Mark an order as shipped, add tracking, and send notification email */
router.patch("/orders/:id/ship", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = shipOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [order] = await db
    .update(ordersTable)
    .set({ trackingNumber: parsed.data.trackingNumber, carrier: parsed.data.carrier, status: "shipped" })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) return res.status(404).json({ error: "Order not found" });

  // Resolve user email from Clerk for shipping notification
  let userEmail: string | null = null;
  let userName: string | null = null;
  let userId: string | null = order.userId ?? null;

  if (!userId && order.subscriptionId) {
    const [sub] = await db.select({ babyId: subscriptionsTable.babyId }).from(subscriptionsTable).where(eq(subscriptionsTable.id, order.subscriptionId));
    if (sub?.babyId) {
      const [baby] = await db.select({ userId: babiesTable.userId }).from(babiesTable).where(eq(babiesTable.id, sub.babyId));
      userId = baby?.userId ?? null;
    }
  }

  if (userId) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      userEmail = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ?? null;
      userName = clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName ?? ""}`.trim() : null;
    } catch {
      // Clerk lookup failed — skip email
    }
  }

  if (userEmail) {
    sendShippingNotification({
      to: userEmail,
      customerName: userName ?? userEmail,
      orderId: order.id,
      trackingNumber: parsed.data.trackingNumber,
      carrier: parsed.data.carrier,
      shippingName: order.shippingName,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
    }).catch(err => req.log.error({ err }, "Failed to send shipping notification"));
  }

  res.json({
    id: order.id,
    status: order.status,
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    scheduledDate: order.scheduledDate,
  });
});

// ── Amazon catalog lookup ─────────────────────────────────────────────────────

/** Search Amazon catalog by keyword or ASIN */
router.get("/amazon/search", requireAdmin, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const results = await searchCatalog(q);
    res.json(results);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Amazon catalog search failed";
    res.status(502).json({ error: msg });
  }
});

/** Get a single ASIN with all its size/count variants */
router.get("/amazon/asin/:asin", requireAdmin, async (req, res) => {
  try {
    const data = await getCatalogItemWithVariants(req.params.asin);
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Amazon ASIN lookup failed";
    res.status(502).json({ error: msg });
  }
});

// ── Bulk SKU import ───────────────────────────────────────────────────────────

const bulkSkuSchema = z.array(
  z.object({
    internalSku: z.string().min(1),
    amazonSellerSku: z.string().min(1),
    asin: z.string().optional(),
    brand: z.string().optional(),
    title: z.string().min(1),
    category: z.enum(APPROVED_CATEGORIES),
    diaperSize: z.string().optional(),
    babyWeightMinLbs: z.number().optional(),
    babyWeightMaxLbs: z.number().optional(),
    unitCount: z.number().int().optional(),
    active: z.boolean().optional(),
    maxQuantityPerOrder: z.number().int().optional(),
    imageUrl: z.string().optional(),
    price: z.number().optional(),
  })
).min(1).max(50);

router.post("/amazon/bulk-import", requireAdmin, async (req, res) => {
  const parsed = bulkSkuSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const results = [];
  for (const item of parsed.data) {
    const [row] = await db
      .insert(approvedSkusTable)
      .values(item)
      .onConflictDoUpdate({
        target: approvedSkusTable.internalSku,
        set: {
          amazonSellerSku: item.amazonSellerSku,
          asin: item.asin ?? null,
          brand: item.brand ?? null,
          title: item.title,
          category: item.category,
          diaperSize: item.diaperSize ?? null,
          babyWeightMinLbs: item.babyWeightMinLbs ?? null,
          babyWeightMaxLbs: item.babyWeightMaxLbs ?? null,
          unitCount: item.unitCount ?? null,
          active: item.active ?? true,
          maxQuantityPerOrder: item.maxQuantityPerOrder ?? 3,
          imageUrl: item.imageUrl ?? null,
          price: item.price ?? null,
        },
      })
      .returning();
    results.push(row);

    // Upsert a corresponding products row so it appears in the catalog
    const [existingProduct] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, item.internalSku));

    if (existingProduct) {
      await db.update(productsTable).set({
        name: item.title,
        brand: item.brand ?? null,
        category: item.category,
      }).where(eq(productsTable.id, existingProduct.id));
    } else {
      await db.insert(productsTable).values({
        name: item.title,
        sku: item.internalSku,
        category: item.category,
        price: item.price ?? 0,
        brand: item.brand ?? null,
      });
    }
  }

  res.status(201).json(results);
});

export default router;
