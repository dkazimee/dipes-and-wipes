/**
 * Approved SKU management routes.
 *
 * These endpoints let admins maintain the Amazon MCF fulfillment allowlist.
 *
 * SECURITY: amazon_seller_sku IS included in responses here (admin use only).
 *   - Never wire these routes to any public-facing API key or unauthenticated path.
 *   - Only internal_sku is accepted from the frontend in subscription/order flows.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { approvedSkusTable, APPROVED_CATEGORIES } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = Router();

const approvedSkuInputSchema = z.object({
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
});

function formatSku(row: typeof approvedSkusTable.$inferSelect) {
  return {
    id: row.id,
    internalSku: row.internalSku,
    amazonSellerSku: row.amazonSellerSku,
    asin: row.asin ?? null,
    brand: row.brand ?? null,
    title: row.title,
    category: row.category,
    diaperSize: row.diaperSize ?? null,
    babyWeightMinLbs: row.babyWeightMinLbs ?? null,
    babyWeightMaxLbs: row.babyWeightMaxLbs ?? null,
    unitCount: row.unitCount ?? null,
    active: row.active,
    maxQuantityPerOrder: row.maxQuantityPerOrder ?? null,
  };
}

/** List all approved SKUs (admin) */
router.get("/", async (_req, res) => {
  const rows = await db.select().from(approvedSkusTable).orderBy(approvedSkusTable.category, approvedSkusTable.internalSku);
  res.json(rows.map(formatSku));
});

/** Get one by id */
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(approvedSkusTable).where(eq(approvedSkusTable.id, id));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(formatSku(row));
});

/** Add a new approved SKU */
router.post("/", requireAdmin, async (req, res) => {
  const parsed = approvedSkuInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(approvedSkusTable).values(parsed.data).returning();
  res.status(201).json(formatSku(created));
});

/** Update an approved SKU (patch — all fields optional) */
router.patch("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = approvedSkuInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db.update(approvedSkusTable).set(parsed.data).where(eq(approvedSkusTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(formatSku(updated));
});

/**
 * Deactivate (soft-delete) an approved SKU.
 * Prefer deactivating over hard deletion so order history stays consistent.
 */
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(approvedSkusTable)
    .set({ active: false })
    .where(eq(approvedSkusTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(formatSku(updated));
});

export default router;
