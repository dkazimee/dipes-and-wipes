import { pgTable, serial, text, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const babiesTable = pgTable("babies", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  birthDate: date("birth_date").notNull(),
  gender: text("gender"),
  avatarEmoji: text("avatar_emoji"),
  currentWeightLbs: real("current_weight_lbs"),
  currentHeightIn: real("current_height_in"),
  weightPercentile: real("weight_percentile"),
  heightPercentile: real("height_percentile"),
  currentDiaperSize: text("current_diaper_size"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBabySchema = createInsertSchema(babiesTable).omit({ id: true, createdAt: true });
export type InsertBaby = z.infer<typeof insertBabySchema>;
export type Baby = typeof babiesTable.$inferSelect;
