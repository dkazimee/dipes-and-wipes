import { pgTable, serial, integer, real, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { babiesTable } from "./babies";

export const growthEntriesTable = pgTable("growth_entries", {
  id: serial("id").primaryKey(),
  babyId: integer("baby_id").notNull().references(() => babiesTable.id, { onDelete: "cascade" }),
  recordedAt: date("recorded_at").notNull(),
  weightLbs: real("weight_lbs"),
  heightIn: real("height_in"),
  weightPercentile: real("weight_percentile"),
  heightPercentile: real("height_percentile"),
  diaperSize: text("diaper_size"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGrowthEntrySchema = createInsertSchema(growthEntriesTable).omit({ id: true, createdAt: true });
export type InsertGrowthEntry = z.infer<typeof insertGrowthEntrySchema>;
export type GrowthEntry = typeof growthEntriesTable.$inferSelect;
