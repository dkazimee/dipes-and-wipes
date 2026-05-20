import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { subscriptionsTable, subscriptionItemsTable, babiesTable, productsTable, ordersTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { tryAutoFulfillMcf } from "../services/subscriptions/auto-fulfill";
import { predictDiaperSizeAtDate } from "../services/growth/cdc";
import { logger } from "../utilities/logger";

const router = Router();

const shippingFields = {
  shippingName: z.string().optional(),
  shippingAddress1: z.string().optional(),
  shippingCity: z.string().optional(),
  shippingState: z.string().optional(),
  shippingZip: z.string().optional(),
  shippingCountry: z.string().default("US"),
};

async function buildSubscription(sub: typeof subscriptionsTable.$inferSelect) {
  const [baby] = await db.select({ name: babiesTable.name }).from(babiesTable).where(eq(babiesTable.id, sub.babyId));
  const items = await db
    .select()
    .from(subscriptionItemsTable)
    .where(eq(subscriptionItemsTable.subscriptionId, sub.id));

  const itemsWithNames = await Promise.all(
    items.map(async (item) => {
      const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, item.productId));
      return {
        productId: item.productId,
        productName: product?.name ?? null,
        quantity: item.quantity,
        priceCents: item.priceCents,
      };
    })
  );

  return {
    id: sub.id,
    babyId: sub.babyId,
    babyName: baby?.name ?? null,
    status: sub.status,
    frequency: sub.frequency,
    brand: sub.brand ?? null,
    currentDiaperSize: sub.currentDiaperSize ?? null,
    nextDeliveryDate: sub.nextDeliveryDate,
    monthlyPriceCents: sub.monthlyPriceCents ?? null,
    shippingName: sub.shippingName ?? null,
    shippingAddress1: sub.shippingAddress1 ?? null,
    shippingCity: sub.shippingCity ?? null,
    shippingState: sub.shippingState ?? null,
    shippingZip: sub.shippingZip ?? null,
    shippingCountry: sub.shippingCountry ?? null,
    items: itemsWithNames,
    createdAt: sub.createdAt.toISOString(),
  };
}

router.get("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const userBabies = await db.select({ id: babiesTable.id }).from(babiesTable).where(eq(babiesTable.userId, userId));
  const babyIds = userBabies.map(b => b.id);
  if (babyIds.length === 0) return res.json([]);

  const subs = await db.select().from(subscriptionsTable).where(inArray(subscriptionsTable.babyId, babyIds)).orderBy(subscriptionsTable.createdAt);
  const results = await Promise.all(subs.map(buildSubscription));
  res.json(results);
});

router.post("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const schema = z.object({
    babyId: z.number(),
    frequency: z.string().default("monthly"),
    nextDeliveryDate: z.string(),
    brand: z.string().optional(),
    items: z.array(z.object({ productId: z.number(), quantity: z.number() })).optional(),
    ...shippingFields,
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const data = parsed.data;

  const [baby] = await db.select().from(babiesTable).where(and(eq(babiesTable.id, data.babyId), eq(babiesTable.userId, userId)));
  if (!baby) return res.status(404).json({ error: "Baby not found" });

  let totalCents = 0;
  const itemsData = data.items ?? [];
  for (const item of itemsData) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) {
      // Use per-unit price when available (e.g. price per diaper × monthly count)
      const unitCents = product.unitPriceCents ?? Math.round(product.price * 100);
      totalCents += unitCents * item.quantity;
    }
  }

  // Predict the diaper size the baby will need on the delivery date using the
  // CDC growth curve. This ensures the first order ships the right size even if
  // the baby will have sized up by the time the box arrives.
  const predictedSize = predictDiaperSizeAtDate(
    baby.birthDate,
    data.nextDeliveryDate,
    {
      weightPercentile: baby.weightPercentile,
      currentWeightLbs: baby.currentWeightLbs,
      gender: baby.gender,
    },
  );

  const [sub] = await db.insert(subscriptionsTable).values({
    babyId: data.babyId,
    frequency: data.frequency,
    nextDeliveryDate: data.nextDeliveryDate,
    currentDiaperSize: predictedSize,
    monthlyPriceCents: totalCents || null,
    status: "active",
    brand: data.brand,
    shippingName: data.shippingName,
    shippingAddress1: data.shippingAddress1,
    shippingCity: data.shippingCity,
    shippingState: data.shippingState,
    shippingZip: data.shippingZip,
    shippingCountry: data.shippingCountry,
  }).returning();

  if (itemsData.length > 0) {
    await db.insert(subscriptionItemsTable).values(
      itemsData.map((item) => ({
        subscriptionId: sub.id,
        productId: item.productId,
        quantity: item.quantity,
        priceCents: null,
      }))
    );
  }

  // ── Generate the first order for this subscription ──────────────────────────
  const [firstOrder] = await db.insert(ordersTable).values({
    subscriptionId: sub.id,
    scheduledDate: data.nextDeliveryDate,
    status: "pending",
    diaperSize: predictedSize,
    totalCents: totalCents || null,
    shippingName: data.shippingName,
    shippingAddress1: data.shippingAddress1,
    shippingCity: data.shippingCity,
    shippingState: data.shippingState,
    shippingZip: data.shippingZip,
    shippingCountry: data.shippingCountry,
  }).returning();

  // Fire-and-forget: attempt MCF auto-fulfillment in the background.
  // We don't block the subscription creation response on this — if MCF
  // fails the order stays pending/fulfillment_error and can be retried.
  if (itemsData.length > 0) {
    tryAutoFulfillMcf(firstOrder.id).then((result) => {
      if (result.skipped) {
        logger.info({ orderId: firstOrder.id, reason: result.skipReason }, "MCF auto-fulfill skipped");
      } else if (!result.success) {
        logger.warn({ orderId: firstOrder.id, error: result.error }, "MCF auto-fulfill failed");
      }
    }).catch((err) => {
      logger.error({ err, orderId: firstOrder.id }, "MCF auto-fulfill unexpected error");
    });
  }
  // ───────────────────────────────────────────────────────────────────────────

  res.status(201).json(await buildSubscription(sub));
});

async function getSubForUser(id: number, userId: string) {
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id));
  if (!sub) return null;
  const [baby] = await db.select({ id: babiesTable.id }).from(babiesTable).where(and(eq(babiesTable.id, sub.babyId), eq(babiesTable.userId, userId)));
  if (!baby) return null;
  return sub;
}

router.get("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  const sub = await getSubForUser(id, userId);
  if (!sub) return res.status(404).json({ error: "Not found" });
  res.json(await buildSubscription(sub));
});

router.patch("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (!await getSubForUser(id, userId)) return res.status(404).json({ error: "Not found" });

  const schema = z.object({
    frequency: z.string().optional(),
    nextDeliveryDate: z.string().optional(),
    items: z.array(z.object({ productId: z.number(), quantity: z.number() })).optional(),
    ...shippingFields,
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.frequency) updateData.frequency = data.frequency;
  if (data.nextDeliveryDate) {
    updateData.nextDeliveryDate = data.nextDeliveryDate;
    // Re-predict the diaper size for the new delivery date
    const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id));
    if (sub) {
      const [baby] = await db
        .select({ birthDate: babiesTable.birthDate, gender: babiesTable.gender, weightPercentile: babiesTable.weightPercentile, currentWeightLbs: babiesTable.currentWeightLbs })
        .from(babiesTable)
        .where(eq(babiesTable.id, sub.babyId));
      if (baby) {
        updateData.currentDiaperSize = predictDiaperSizeAtDate(
          baby.birthDate,
          data.nextDeliveryDate,
          { weightPercentile: baby.weightPercentile, currentWeightLbs: baby.currentWeightLbs, gender: baby.gender },
        );
      }
    }
  }
  if (data.shippingName !== undefined) updateData.shippingName = data.shippingName;
  if (data.shippingAddress1 !== undefined) updateData.shippingAddress1 = data.shippingAddress1;
  if (data.shippingCity !== undefined) updateData.shippingCity = data.shippingCity;
  if (data.shippingState !== undefined) updateData.shippingState = data.shippingState;
  if (data.shippingZip !== undefined) updateData.shippingZip = data.shippingZip;
  if (data.shippingCountry !== undefined) updateData.shippingCountry = data.shippingCountry;

  const [sub] = await db.update(subscriptionsTable).set(updateData).where(eq(subscriptionsTable.id, id)).returning();
  if (!sub) return res.status(404).json({ error: "Not found" });

  if (data.items) {
    await db.delete(subscriptionItemsTable).where(eq(subscriptionItemsTable.subscriptionId, id));
    if (data.items.length > 0) {
      await db.insert(subscriptionItemsTable).values(
        data.items.map((item) => ({
          subscriptionId: id,
          productId: item.productId,
          quantity: item.quantity,
          priceCents: null,
        }))
      );
    }
  }

  res.json(await buildSubscription(sub));
});

router.delete("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (!await getSubForUser(id, userId)) return res.status(404).json({ error: "Not found" });
  await db
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(and(eq(ordersTable.subscriptionId, id), inArray(ordersTable.status, ["pending", "processing"])));
  await db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, id));
  res.status(204).send();
});

router.post("/:id/pause", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (!await getSubForUser(id, userId)) return res.status(404).json({ error: "Not found" });
  const [sub] = await db.update(subscriptionsTable).set({ status: "paused" }).where(eq(subscriptionsTable.id, id)).returning();
  if (!sub) return res.status(404).json({ error: "Not found" });
  res.json(await buildSubscription(sub));
});

router.post("/:id/resume", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (!await getSubForUser(id, userId)) return res.status(404).json({ error: "Not found" });
  const [sub] = await db.update(subscriptionsTable).set({ status: "active" }).where(eq(subscriptionsTable.id, id)).returning();
  if (!sub) return res.status(404).json({ error: "Not found" });
  res.json(await buildSubscription(sub));
});

export default router;
