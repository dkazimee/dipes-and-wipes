import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subscriptionsTable } from "./subscriptions";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => subscriptionsTable.id, { onDelete: "set null" }),
  userId: text("user_id"),
  status: text("status").notNull().default("pending"),
  scheduledDate: date("scheduled_date").notNull(),
  diaperSize: text("diaper_size"),
  totalCents: integer("total_cents"),
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"),
  fulfillmentProvider: text("fulfillment_provider"),
  fulfillmentId: text("fulfillment_id"),
  fulfillmentStatus: text("fulfillment_status"),
  /** Human-readable reason stored when status = "fulfillment_error" */
  fulfillmentErrorMessage: text("fulfillment_error_message"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  shippingName: text("shipping_name"),
  shippingAddress1: text("shipping_address1"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingZip: text("shipping_zip"),
  shippingCountry: text("shipping_country").default("US"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
