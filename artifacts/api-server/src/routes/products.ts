import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, approvedSkusTable, APPROVED_CATEGORIES } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

/**
 * SECURITY NOTE: This formatter deliberately omits amazon_seller_sku.
 * That field lives in approved_skus and must never reach the frontend.
 * The backend maps internal_sku → amazon_seller_sku server-side only.
 */
function formatProduct(row: {
  id: number;
  name: string;
  category: string;
  description: string | null;
  price: number;
  imageEmoji: string | null;
  compatibleSizes: string | null;
  brand: string | null;
  sku: string | null;
  shipbobProductId: number | null;
  productImageUrl: string | null;
  unitPriceCents: number | null;
  packSize: number | null;
  asin: string | null;
  diaperSize: string | null;
  babyWeightMinLbs: number | null;
  babyWeightMaxLbs: number | null;
  unitCount: number | null;
  maxQuantityPerOrder: number | null;
  skuImageUrl: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    price: row.price,
    imageEmoji: row.imageEmoji ?? null,
    compatibleSizes: row.compatibleSizes ?? null,
    brand: row.brand ?? null,
    sku: row.sku ?? null,
    shipbobProductId: row.shipbobProductId ?? null,
    asin: row.asin ?? null,
    diaperSize: row.diaperSize ?? null,
    babyWeightMinLbs: row.babyWeightMinLbs ?? null,
    babyWeightMaxLbs: row.babyWeightMaxLbs ?? null,
    unitCount: row.unitCount ?? null,
    maxQuantityPerOrder: row.maxQuantityPerOrder ?? null,
    // Products table imageUrl takes priority; fall back to approved_skus imageUrl
    imageUrl: row.productImageUrl ?? row.skuImageUrl ?? null,
    unitPriceCents: row.unitPriceCents ?? null,
    packSize: row.packSize ?? null,
  };
}

const APPROVED_CAT_LIST = [...APPROVED_CATEGORIES];

/** Shared column selection for the products ✕ approved_skus join */
const productCols = {
  id: productsTable.id,
  name: productsTable.name,
  category: productsTable.category,
  description: productsTable.description,
  price: productsTable.price,
  imageEmoji: productsTable.imageEmoji,
  compatibleSizes: productsTable.compatibleSizes,
  brand: productsTable.brand,
  sku: productsTable.sku,
  shipbobProductId: productsTable.shipbobProductId,
  productImageUrl: productsTable.imageUrl,
  unitPriceCents: productsTable.unitPriceCents,
  packSize: productsTable.packSize,
  // Enriched from approved_skus — public fields only
  asin: approvedSkusTable.asin,
  diaperSize: approvedSkusTable.diaperSize,
  babyWeightMinLbs: approvedSkusTable.babyWeightMinLbs,
  babyWeightMaxLbs: approvedSkusTable.babyWeightMaxLbs,
  unitCount: approvedSkusTable.unitCount,
  maxQuantityPerOrder: approvedSkusTable.maxQuantityPerOrder,
  skuImageUrl: approvedSkusTable.imageUrl,
};

/**
 * GET /products
 *
 * By default returns ONLY products that have an active approved_skus row
 * in one of the five approved categories.
 *
 * Pass ?approved=all to skip the filter (admin use).
 */
router.get("/", async (req, res) => {
  const category = req.query.category as string | undefined;

  // Always LEFT JOIN so products without an approved_sku still appear in the
  // catalog. The approved_skus row enriches each product with Amazon-specific
  // fields (asin, diaperSize, imageUrl, etc.) when available.
  const base = db.select(productCols)
    .from(productsTable)
    .leftJoin(approvedSkusTable, eq(productsTable.sku, approvedSkusTable.internalSku));

  let rows;
  if (category) {
    rows = await base.where(eq(productsTable.category, category));
  } else {
    rows = await base;
  }

  res.json(rows.map(formatProduct));
});

const productInputSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  imageEmoji: z.string().optional(),
  compatibleSizes: z.string().optional(),
  brand: z.string().optional(),
  sku: z.string().optional(),
  shipbobProductId: z.number().int().optional(),
});

router.post("/", async (req, res) => {
  const parsed = productInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(productsTable).values(parsed.data).returning();
  res.status(201).json({ ...formatProduct({ ...created, asin: null, diaperSize: null, babyWeightMinLbs: null, babyWeightMaxLbs: null, unitCount: null, maxQuantityPerOrder: null, productImageUrl: created.imageUrl ?? null, unitPriceCents: created.unitPriceCents ?? null, skuImageUrl: null }), description: created.description ?? null });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = productInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db.update(productsTable).set(parsed.data).where(eq(productsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...formatProduct({ ...updated, asin: null, diaperSize: null, babyWeightMinLbs: null, babyWeightMaxLbs: null, unitCount: null, maxQuantityPerOrder: null, productImageUrl: updated.imageUrl ?? null, unitPriceCents: updated.unitPriceCents ?? null, skuImageUrl: null }), description: updated.description ?? null });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).send();
});

export default router;
