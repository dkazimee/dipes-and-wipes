import { Router } from "express";
import { db } from "@workspace/db";
import { growthEntriesTable, babiesTable, subscriptionsTable } from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { z } from "zod";
import { calcDiaperSize } from "./babies";
import { predictWeightLbs, predictHeightIn, calcPercentileForWeight, calcPercentileForHeight, ageInMonths, ageInMonthsAt, calcWipesPerMonth, calcDiapersPerMonth } from "../services/cdc-growth";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const babyId = Number((req.params as { id: string }).id);
  const entries = await db
    .select()
    .from(growthEntriesTable)
    .where(eq(growthEntriesTable.babyId, babyId))
    .orderBy(desc(growthEntriesTable.recordedAt));
  res.json(entries.map(formatEntry));
});

router.post("/", async (req, res) => {
  const babyId = Number((req.params as { id: string }).id);
  const schema = z.object({
    recordedAt: z.string(),
    weightLbs: z.number().optional(),
    heightIn: z.number().optional(),
    weightPercentile: z.number().optional(),
    heightPercentile: z.number().optional(),
    diaperSize: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const data = parsed.data;
  const diaperSize = data.diaperSize ?? (data.weightLbs ? calcDiaperSize(data.weightLbs) : null);

  // Fetch baby for birth date + gender (needed for CDC percentile auto-calculation)
  const [baby] = await db
    .select({ birthDate: babiesTable.birthDate, gender: babiesTable.gender })
    .from(babiesTable)
    .where(eq(babiesTable.id, babyId));

  const babyGender = baby?.gender as "male" | "female" | null | undefined;

  // Auto-calculate CDC percentile from actual weight if not provided
  let computedWeightPercentile = data.weightPercentile;
  if (data.weightLbs && !data.weightPercentile && baby) {
    const ageAtEntry = ageInMonthsAt(baby.birthDate, data.recordedAt);
    computedWeightPercentile = calcPercentileForWeight(ageAtEntry, data.weightLbs, babyGender);
  }

  // Auto-calculate CDC height percentile from actual height if not provided
  let computedHeightPercentile = data.heightPercentile;
  if (data.heightIn && !data.heightPercentile && baby) {
    const ageAtEntry = ageInMonthsAt(baby.birthDate, data.recordedAt);
    computedHeightPercentile = calcPercentileForHeight(ageAtEntry, data.heightIn, babyGender);
  }

  const [entry] = await db.insert(growthEntriesTable).values({
    babyId,
    recordedAt: data.recordedAt,
    weightLbs: data.weightLbs ?? null,
    heightIn: data.heightIn ?? null,
    weightPercentile: computedWeightPercentile ?? null,
    heightPercentile: computedHeightPercentile ?? null,
    diaperSize,
    notes: data.notes ?? null,
  }).returning();

  // Update baby's current stats, including the computed percentiles
  if (data.weightLbs || data.heightIn) {
    const updateData: Record<string, unknown> = {};
    if (data.weightLbs) {
      updateData.currentWeightLbs = data.weightLbs;
      updateData.currentDiaperSize = diaperSize;
    }
    if (data.heightIn) updateData.currentHeightIn = data.heightIn;
    if (computedWeightPercentile != null) updateData.weightPercentile = computedWeightPercentile;
    if (computedHeightPercentile != null) updateData.heightPercentile = computedHeightPercentile;
    await db.update(babiesTable).set(updateData).where(eq(babiesTable.id, babyId));
  }

  res.status(201).json(formatEntry(entry));
});

router.patch("/:entryId", async (req, res) => {
  const babyId = Number((req.params as { id: string }).id);
  const entryId = Number(req.params.entryId);

  const schema = z.object({
    recordedAt: z.string().optional(),
    weightLbs: z.number().optional().nullable(),
    heightIn: z.number().optional().nullable(),
    weightPercentile: z.number().optional().nullable(),
    heightPercentile: z.number().optional().nullable(),
    diaperSize: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const data = parsed.data;

  const [baby] = await db
    .select({ birthDate: babiesTable.birthDate, gender: babiesTable.gender })
    .from(babiesTable)
    .where(eq(babiesTable.id, babyId));
  if (!baby) return res.status(404).json({ error: "Baby not found" });

  const babyGender = baby.gender as "male" | "female" | null | undefined;
  const recordedAt = data.recordedAt;

  // Auto-compute percentiles from measurements if not explicitly provided
  let weightPercentile = data.weightPercentile;
  let heightPercentile = data.heightPercentile;

  if (data.weightLbs != null && data.weightPercentile === undefined && recordedAt) {
    const age = ageInMonthsAt(baby.birthDate, recordedAt);
    weightPercentile = calcPercentileForWeight(age, data.weightLbs, babyGender);
  }
  if (data.heightIn != null && data.heightPercentile === undefined && recordedAt) {
    const age = ageInMonthsAt(baby.birthDate, recordedAt);
    heightPercentile = calcPercentileForHeight(age, data.heightIn, babyGender);
  }

  const diaperSize =
    data.diaperSize !== undefined
      ? data.diaperSize
      : data.weightLbs != null
        ? calcDiaperSize(data.weightLbs)
        : undefined;

  const updateFields: Record<string, unknown> = {};
  if (recordedAt !== undefined) updateFields.recordedAt = recordedAt;
  if (data.weightLbs !== undefined) updateFields.weightLbs = data.weightLbs;
  if (data.heightIn !== undefined) updateFields.heightIn = data.heightIn;
  if (weightPercentile !== undefined) updateFields.weightPercentile = weightPercentile;
  if (heightPercentile !== undefined) updateFields.heightPercentile = heightPercentile;
  if (diaperSize !== undefined) updateFields.diaperSize = diaperSize;
  if (data.notes !== undefined) updateFields.notes = data.notes;

  const [updated] = await db
    .update(growthEntriesTable)
    .set(updateFields)
    .where(eq(growthEntriesTable.id, entryId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Entry not found" });

  // Re-sync baby's current stats from the most recent entries
  await syncBabyStats(babyId, babyGender, baby.birthDate);

  res.json(formatEntry(updated));
});

router.delete("/:entryId", async (req, res) => {
  const babyId = Number((req.params as { id: string }).id);
  const entryId = Number(req.params.entryId);

  const [deleted] = await db
    .delete(growthEntriesTable)
    .where(eq(growthEntriesTable.id, entryId))
    .returning();

  if (!deleted) return res.status(404).json({ error: "Entry not found" });

  const [baby] = await db
    .select({ birthDate: babiesTable.birthDate, gender: babiesTable.gender })
    .from(babiesTable)
    .where(eq(babiesTable.id, babyId));

  if (baby) {
    const babyGender = baby.gender as "male" | "female" | null | undefined;
    await syncBabyStats(babyId, babyGender, baby.birthDate);
  }

  res.status(204).send();
});

/**
 * Re-sync baby.currentWeightLbs, currentHeightIn, weightPercentile,
 * heightPercentile, and currentDiaperSize from the most recent growth entries.
 * Called after an entry is updated or deleted.
 */
async function syncBabyStats(
  babyId: number,
  babyGender: "male" | "female" | null | undefined,
  birthDate: string,
) {
  const entries = await db
    .select()
    .from(growthEntriesTable)
    .where(eq(growthEntriesTable.babyId, babyId))
    .orderBy(desc(growthEntriesTable.recordedAt))
    .limit(20);

  const latestWeight = entries.find(e => e.weightLbs != null);
  const latestHeight = entries.find(e => e.heightIn != null);

  const update: Record<string, unknown> = {};

  if (latestWeight) {
    update.currentWeightLbs = latestWeight.weightLbs;
    update.currentDiaperSize = calcDiaperSize(latestWeight.weightLbs!);
    const age = ageInMonthsAt(birthDate, latestWeight.recordedAt);
    update.weightPercentile =
      latestWeight.weightPercentile ??
      calcPercentileForWeight(age, latestWeight.weightLbs!, babyGender);
  } else {
    update.currentWeightLbs = null;
    update.weightPercentile = null;
    update.currentDiaperSize = null;
  }

  if (latestHeight) {
    update.currentHeightIn = latestHeight.heightIn;
    const age = ageInMonthsAt(birthDate, latestHeight.recordedAt);
    update.heightPercentile =
      latestHeight.heightPercentile ??
      calcPercentileForHeight(age, latestHeight.heightIn!, babyGender);
  } else {
    update.currentHeightIn = null;
    update.heightPercentile = null;
  }

  await db.update(babiesTable).set(update).where(eq(babiesTable.id, babyId));
}

// A measurement is "recent" if it was taken within this many days.
// Within this window we trust the actual weight; beyond it we project forward on the tracked CDC curve.
const RECENT_MEASUREMENT_DAYS = 30;

router.get("/size-recommendation", async (req, res) => {
  const babyId = Number((req.params as { id: string }).id);
  const [baby] = await db.select().from(babiesTable).where(eq(babiesTable.id, babyId));
  if (!baby) return res.status(404).json({ error: "Not found" });

  const babyGender = baby.gender as "male" | "female" | null | undefined;
  const currentAgeMonths = ageInMonths(baby.birthDate);
  const trackedPercentile = baby.weightPercentile ?? null;

  // Walk through recent entries to find the latest ones with weight and/or height
  const allRecentEntries = await db
    .select({
      weightLbs: growthEntriesTable.weightLbs,
      heightIn: growthEntriesTable.heightIn,
      recordedAt: growthEntriesTable.recordedAt,
    })
    .from(growthEntriesTable)
    .where(eq(growthEntriesTable.babyId, babyId))
    .orderBy(desc(growthEntriesTable.recordedAt))
    .limit(20);

  const latestWithWeight = allRecentEntries.find(e => e.weightLbs != null);
  const latestWithHeight = allRecentEntries.find(e => e.heightIn != null);

  // Is the most recent weight measurement still "fresh"?
  let recentActualWeight: number | null = null;
  let lastMeasurementDate: string | null = null;

  if (latestWithWeight?.weightLbs) {
    const measurementDate = new Date(latestWithWeight.recordedAt);
    const daysSinceMeasurement = (Date.now() - measurementDate.getTime()) / (1000 * 60 * 60 * 24);
    lastMeasurementDate = latestWithWeight.recordedAt;
    if (daysSinceMeasurement <= RECENT_MEASUREMENT_DAYS) {
      recentActualWeight = latestWithWeight.weightLbs;
    }
  }

  // Determine how we're predicting the weight using the three-tier fallback:
  // 1. Recent actual measurement (≤ 30 days old) — most accurate
  // 2. CDC percentile curve at current age using the tracked percentile from past entries
  // 3. CDC median (50th percentile) — no weight data at all
  let predictedWeightLbs: number;
  let predictionBasis: string;
  let confidenceNote: string;

  if (recentActualWeight) {
    // Measurement is fresh — use it directly
    predictedWeightLbs = recentActualWeight;
    predictionBasis = "actual-measurement";
    if (trackedPercentile != null) {
      confidenceNote = `Based on ${baby.name}'s recent weight of ${recentActualWeight} lbs (${Math.round(trackedPercentile)}th percentile). ` +
        `Future predictions follow the Dipes & Wipes ${ordinal(Math.round(trackedPercentile))} percentile growth curve.`;
    } else {
      confidenceNote = `Based on ${baby.name}'s recent weight of ${recentActualWeight} lbs.`;
    }
  } else if (trackedPercentile != null) {
    // Past measurement exists but is older than 30 days — project forward on tracked CDC curve
    predictedWeightLbs = predictWeightLbs(currentAgeMonths, trackedPercentile, babyGender);
    predictionBasis = "cdc-tracked-percentile";
    const lastDateNote = lastMeasurementDate ? ` (last measured ${lastMeasurementDate})` : "";
    confidenceNote = `Estimated ${predictedWeightLbs} lbs based on our smart size prediction curve at ${Math.round(currentAgeMonths)} months old${lastDateNote}. ` +
      `Add a recent weight measurement for a more accurate size.`;
  } else {
    // No weight data at all — use CDC median (50th percentile)
    predictedWeightLbs = predictWeightLbs(currentAgeMonths, 50, babyGender);
    predictionBasis = "cdc-median";
    confidenceNote = `Estimated ${predictedWeightLbs} lbs based on our smart size prediction curve at ${Math.round(currentAgeMonths)} months old. ` +
      `Log ${baby.name}'s first weight measurement to get a personalized prediction.`;
  }

  const recommendedSize = calcDiaperSize(predictedWeightLbs);

  // Next-size-up estimates
  const sizeRanges: Record<string, { max: number; next: string }> = {
    "Preemie":  { max: 6,        next: "Newborn" },
    "Newborn":  { max: 8,        next: "Size 1"  },
    "Size 1":   { max: 12,       next: "Size 2"  },
    "Size 2":   { max: 16,       next: "Size 3"  },
    "Size 3":   { max: 25,       next: "Size 4"  },
    "Size 4":   { max: 32,       next: "Size 5"  },
    "Size 5":   { max: 38,       next: "Size 6"  },
    "Size 6":   { max: Infinity, next: "Size 6"  },
  };

  const range = sizeRanges[recommendedSize];
  const nextSize = range?.next !== recommendedSize ? range?.next : null;

  // Project when the baby will hit the next size boundary using CDC curve
  let nextSizeAt: string | null = null;
  let estimatedMonthsInSize: number | null = null;

  if (range && range.max < Infinity) {
    // Find the future age at which predicted weight crosses the size boundary
    const usedPercentile = trackedPercentile ?? (recentActualWeight ? calcPercentileForWeight(currentAgeMonths, recentActualWeight, babyGender) : 50);
    let crossingMonths: number | null = null;
    for (let futureMonths = currentAgeMonths; futureMonths <= 60; futureMonths += 0.5) {
      const futureWeight = predictWeightLbs(futureMonths, usedPercentile, babyGender);
      if (futureWeight >= range.max) {
        crossingMonths = futureMonths;
        break;
      }
    }
    if (crossingMonths != null) {
      const monthsFromNow = Math.max(0, Math.round(crossingMonths - currentAgeMonths));
      estimatedMonthsInSize = monthsFromNow;
      if (monthsFromNow > 0) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + monthsFromNow * 30);
        nextSizeAt = nextDate.toISOString().split("T")[0];
      } else {
        nextSizeAt = new Date().toISOString().split("T")[0];
      }
    }
  }

  // Check if there's an active subscription and predict size at next delivery
  let predictedSizeAtNextDelivery: string | null = null;
  let nextDeliveryDate: string | null = null;
  const today = new Date().toISOString().split("T")[0];
  const [sub] = await db
    .select({ nextDeliveryDate: subscriptionsTable.nextDeliveryDate, currentDiaperSize: subscriptionsTable.currentDiaperSize, id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.babyId, babyId),
      eq(subscriptionsTable.status, "active"),
      gte(subscriptionsTable.nextDeliveryDate, today),
    ))
    .orderBy(subscriptionsTable.nextDeliveryDate)
    .limit(1);

  if (sub) {
    nextDeliveryDate = sub.nextDeliveryDate;
    const deliveryAgeMonths = ageInMonthsAt(baby.birthDate, sub.nextDeliveryDate);
    const usedPercentile = trackedPercentile ?? (recentActualWeight ? calcPercentileForWeight(currentAgeMonths, recentActualWeight, babyGender) : 50);
    const deliveryWeight = predictWeightLbs(deliveryAgeMonths, usedPercentile, babyGender);
    predictedSizeAtNextDelivery = calcDiaperSize(deliveryWeight);

    // Keep subscription's currentDiaperSize in sync with our prediction
    if (sub.currentDiaperSize !== recommendedSize) {
      await db.update(subscriptionsTable)
        .set({ currentDiaperSize: recommendedSize })
        .where(eq(subscriptionsTable.id, sub.id));
    }
  }

  // Keep the baby record's currentDiaperSize in sync with our prediction so the
  // babies list always shows up-to-date size info (especially for CDC projections).
  // Only update if the value has changed to avoid unnecessary writes.
  if (baby.currentDiaperSize !== recommendedSize) {
    await db.update(babiesTable)
      .set({ currentDiaperSize: recommendedSize })
      .where(eq(babiesTable.id, babyId));
  }
  // For CDC projections (not a fresh actual measurement), also update the stored
  // weight so the list reflects the projected current weight, not the stale one.
  if (predictionBasis !== "actual-measurement" && baby.currentWeightLbs !== predictedWeightLbs) {
    await db.update(babiesTable)
      .set({ currentWeightLbs: predictedWeightLbs })
      .where(eq(babiesTable.id, babyId));
  }

  const reasoning = predictionBasis === "actual-measurement"
    ? `At ${predictedWeightLbs} lbs, ${baby.name} fits ${recommendedSize} diapers.${estimatedMonthsInSize != null && estimatedMonthsInSize > 0 ? ` Estimated ${estimatedMonthsInSize} month(s) until sizing up to ${range?.next}.` : estimatedMonthsInSize === 0 ? " Ready to size up soon!" : ""}`
    : `Predicted ${predictedWeightLbs} lbs at ${Math.round(currentAgeMonths)} months old → ${recommendedSize}.${estimatedMonthsInSize != null && estimatedMonthsInSize > 0 ? ` Estimated ${estimatedMonthsInSize} month(s) until sizing up to ${range?.next}.` : ""}`;

  // Always project height for the baby's current age using CDC curves
  const heightPercentile = baby.heightPercentile ?? trackedPercentile ?? 50;
  const predictedHeightIn = predictHeightIn(currentAgeMonths, heightPercentile, babyGender);
  // Derive height percentile from an actual measured height in growth entries (not circular).
  // Only set if we have a real height measurement; never back-calculate from the CDC projection.
  const predictedHeightPercentile = baby.heightPercentile != null
    ? null
    : latestWithHeight?.heightIn != null
      ? calcPercentileForHeight(currentAgeMonths, latestWithHeight.heightIn, babyGender)
      : null;

  res.json({
    babyId,
    recommendedSize,
    currentWeightLbs: baby.currentWeightLbs ?? null,
    predictedWeightLbs,
    predictedHeightIn,
    recentHeightIn: latestWithHeight?.heightIn ?? null,
    predictedHeightPercentile,
    predictionBasis,
    confidenceNote,
    trackedPercentile,
    reasoning,
    nextSizeAt,
    nextSize: nextSize ?? null,
    estimatedMonthsInSize,
    predictedSizeAtNextDelivery,
    nextDeliveryDate,
  });
});

router.get("/diapers-recommendation", async (req, res) => {
  const babyId = Number((req.params as { id: string }).id);
  const [baby] = await db.select({ birthDate: babiesTable.birthDate, name: babiesTable.name })
    .from(babiesTable)
    .where(eq(babiesTable.id, babyId));
  if (!baby) return res.status(404).json({ error: "Not found" });

  const currentAgeMonths = ageInMonths(baby.birthDate);
  const { changesPerDay, diapersPerMonth, label } = calcDiapersPerMonth(currentAgeMonths);

  const roundedAge = Math.round(currentAgeMonths);
  const explanation = `At ${roundedAge} month${roundedAge !== 1 ? "s" : ""}, ${baby.name} is in the ${label} stage. ` +
    `Babies typically need ~${changesPerDay} changes/day, which works out to ~${diapersPerMonth} diapers/month.`;

  res.json({ babyId, ageInMonths: currentAgeMonths, changesPerDay, diapersPerMonth, explanation });
});

router.get("/wipes-recommendation", async (req, res) => {
  const babyId = Number((req.params as { id: string }).id);
  const [baby] = await db.select({ birthDate: babiesTable.birthDate, name: babiesTable.name })
    .from(babiesTable)
    .where(eq(babiesTable.id, babyId));
  if (!baby) return res.status(404).json({ error: "Not found" });

  const currentAgeMonths = ageInMonths(baby.birthDate);
  const { changesPerDay, wipesPerMonth, label } = calcWipesPerMonth(currentAgeMonths);

  const roundedAge = Math.round(currentAgeMonths);
  const explanation = `At ${roundedAge} month${roundedAge !== 1 ? "s" : ""}, ${baby.name} is in the ${label} stage. ` +
    `Babies typically need ~${changesPerDay} changes/day (~${wipesPerMonth.toLocaleString()} wipes/month using 4 wipes per change).`;

  res.json({ babyId, ageInMonths: currentAgeMonths, changesPerDay, wipesPerMonth, explanation });
});

function formatEntry(e: typeof growthEntriesTable.$inferSelect) {
  return {
    id: e.id,
    babyId: e.babyId,
    recordedAt: e.recordedAt,
    weightLbs: e.weightLbs,
    heightIn: e.heightIn,
    weightPercentile: e.weightPercentile,
    heightPercentile: e.heightPercentile,
    diaperSize: e.diaperSize,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  };
}

export default router;
