/**
 * approved_skus — Amazon MCF fulfillment allowlist.
 *
 * Only products whose internal_sku appears here (and is active) are ever
 * shown to users or accepted in the MCF fulfillment flow.
 *
 * SECURITY: amazon_seller_sku is stored here and used solely by the backend
 * when creating fulfillment orders with Amazon SP-API.  It must never be
 * returned in any public API response — the backend maps
 * internal_sku → amazon_seller_sku internally.
 */
import { pgTable, serial, text, real, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const APPROVED_CATEGORIES = [
  "diapers",
  "wipes",
  "diaper cream",
  "baby bath",
  "baby health",
] as const;

export type ApprovedCategory = (typeof APPROVED_CATEGORIES)[number];

export const approvedSkusTable = pgTable("approved_skus", {
  id: serial("id").primaryKey(),
  /** Maps to products.sku — the only SKU identifier the frontend ever sees */
  internalSku: text("internal_sku").unique().notNull(),
  /**
   * Amazon Seller Central SKU — NEVER exposed in API responses.
   * Populated by the backend admin; used only in SP-API calls.
   */
  amazonSellerSku: text("amazon_seller_sku").notNull(),
  asin: text("asin"),
  brand: text("brand"),
  /** Display title (may differ from products.name) */
  title: text("title").notNull(),
  /** Must be one of the APPROVED_CATEGORIES values */
  category: text("category").notNull(),
  /** For diaper products: the size string (e.g. "Size 1") */
  diaperSize: text("diaper_size"),
  babyWeightMinLbs: real("baby_weight_min_lbs"),
  babyWeightMaxLbs: real("baby_weight_max_lbs"),
  /** Units per package (e.g. 72 wipes) */
  unitCount: integer("unit_count"),
  /** When false the SKU is hidden from the catalog and blocked from fulfillment */
  active: boolean("active").notNull().default(true),
  /** Hard cap on units per MCF fulfillment order */
  maxQuantityPerOrder: integer("max_quantity_per_order").default(3),
  /** Product image URL from Amazon catalog */
  imageUrl: text("image_url"),
  /** Retail price in dollars */
  price: real("price"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApprovedSkuSchema = createInsertSchema(approvedSkusTable).omit({ id: true });
export type InsertApprovedSku = z.infer<typeof insertApprovedSkuSchema>;
export type ApprovedSku = typeof approvedSkusTable.$inferSelect;
