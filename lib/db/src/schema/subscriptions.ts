import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { babiesTable } from "./babies";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  babyId: integer("baby_id").notNull().references(() => babiesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  frequency: text("frequency").notNull().default("monthly"),
  currentDiaperSize: text("current_diaper_size"),
  nextDeliveryDate: date("next_delivery_date").notNull(),
  monthlyPriceCents: integer("monthly_price_cents"),
  shippingName: text("shipping_name"),
  shippingAddress1: text("shipping_address1"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingZip: text("shipping_zip"),
  shippingCountry: text("shipping_country").default("US"),
  brand: text("brand"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptionItemsTable = pgTable("subscription_items", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  priceCents: integer("price_cents"),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;

export const insertSubscriptionItemSchema = createInsertSchema(subscriptionItemsTable).omit({ id: true });
export type InsertSubscriptionItem = z.infer<typeof insertSubscriptionItemSchema>;
export type SubscriptionItem = typeof subscriptionItemsTable.$inferSelect;
