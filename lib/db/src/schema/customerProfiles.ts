import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customerProfilesTable = pgTable("customer_profiles", {
  userId: text("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCustomerProfileSchema = createInsertSchema(customerProfilesTable).omit({ createdAt: true });
export type InsertCustomerProfile = z.infer<typeof insertCustomerProfileSchema>;
export type CustomerProfile = typeof customerProfilesTable.$inferSelect;
