import { pgTable, serial, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  imageEmoji: text("image_emoji"),
  compatibleSizes: text("compatible_sizes"),
  brand: text("brand"),
  /**
   * Internal SKU — links this product to an approved_skus.internal_sku row.
   * This is the only SKU value ever accepted from the frontend.
   * The backend maps it to amazon_seller_sku via the approved_skus table.
   */
  sku: text("sku"),
  shipbobProductId: integer("shipbob_product_id"),
  imageUrl: text("image_url"),
  /** Price per individual unit in cents (per diaper, per wipe). Used to compute monthly subscription cost from usage quantity. */
  unitPriceCents: integer("unit_price_cents"),
  /** Number of individual units (diapers) in one retail pack. Used to convert from monthly usage count to pack quantity for orders. */
  packSize: integer("pack_size"),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
