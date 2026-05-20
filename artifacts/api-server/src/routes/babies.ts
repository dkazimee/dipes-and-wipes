import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { babiesTable, growthEntriesTable } from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { predictWeightLbs, ageInMonths, calcPercentileForHeight } from "../services/growth/cdc";

const RECENT_MEASUREMENT_DAYS = 30;

const router = Router();

router.get("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const babies = await db.select().from(babiesTable).where(eq(babiesTable.userId, userId)).orderBy(babiesTable.createdAt);
  if (!babies.length) return res.json([]);

  // Batch-fetch the most recent growth entry with a weight for each baby
  const babyIds = babies.map(b => b.id);
  const recentEntries = await db
    .select({ babyId: growthEntriesTable.babyId, weightLbs: growthEntriesTable.weightLbs, recordedAt: growthEntriesTable.recordedAt })
    .from(growthEntriesTable)
    .where(inArray(growthEntriesTable.babyId, babyIds))
    .orderBy(desc(growthEntriesTable.recordedAt));

  // Keep only the latest entry with a weight per baby
  const latestWeightByBaby = new Map<number, { weightLbs: number; recordedAt: string }>();
  for (const entry of recentEntries) {
    if (entry.weightLbs != null && !latestWeightByBaby.has(entry.babyId)) {
      latestWeightByBaby.set(entry.babyId, { weightLbs: entry.weightLbs, recordedAt: entry.recordedAt });
    }
  }

  const result = babies.map(baby => {
    const currentAgeMonths = ageInMonths(baby.birthDate);
    const latest = latestWeightByBaby.get(baby.id);
    let projectedWeightLbs: number | null = baby.currentWeightLbs;
    let projectedDiaperSize: string | null = baby.currentDiaperSize;

    if (latest) {
      const daysSince = (Date.now() - new Date(latest.recordedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince <= RECENT_MEASUREMENT_DAYS) {
        // Fresh measurement — use directly
        projectedWeightLbs = latest.weightLbs;
      } else if (baby.weightPercentile != null) {
        // Stale measurement — project forward on tracked CDC curve
        projectedWeightLbs = predictWeightLbs(currentAgeMonths, baby.weightPercentile);
      } else {
        projectedWeightLbs = predictWeightLbs(currentAgeMonths, 50);
      }
    } else if (baby.weightPercentile != null) {
      projectedWeightLbs = predictWeightLbs(currentAgeMonths, baby.weightPercentile);
    } else if (projectedWeightLbs == null) {
      projectedWeightLbs = predictWeightLbs(currentAgeMonths, 50);
    }

    if (projectedWeightLbs != null) {
      projectedDiaperSize = calcDiaperSize(projectedWeightLbs);
    }

    return formatBaby({ ...baby, currentWeightLbs: projectedWeightLbs, currentDiaperSize: projectedDiaperSize });
  });

  res.json(result);
});

router.post("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const schema = z.object({
    name: z.string().min(1),
    birthDate: z.string(),
    gender: z.string().optional(),
    avatarEmoji: z.string().optional(),
    currentWeightLbs: z.number().optional(),
    currentHeightIn: z.number().optional(),
    weightPercentile: z.number().optional(),
    heightPercentile: z.number().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const data = parsed.data;
  const diaperSize = data.currentWeightLbs ? calcDiaperSize(data.currentWeightLbs) : null;

  const [baby] = await db.insert(babiesTable).values({
    userId,
    name: data.name,
    birthDate: data.birthDate,
    gender: data.gender ?? null,
    avatarEmoji: data.avatarEmoji ?? null,
    currentWeightLbs: data.currentWeightLbs ?? null,
    currentHeightIn: data.currentHeightIn ?? null,
    weightPercentile: data.weightPercentile ?? null,
    heightPercentile: data.heightPercentile ?? null,
    currentDiaperSize: diaperSize,
    notes: data.notes ?? null,
  }).returning();

  // Auto-create the first growth entry if any measurements were provided
  if (data.currentWeightLbs || data.currentHeightIn) {
    await db.insert(growthEntriesTable).values({
      babyId: baby.id,
      recordedAt: data.birthDate,
      weightLbs: data.currentWeightLbs ?? null,
      heightIn: data.currentHeightIn ?? null,
      weightPercentile: data.weightPercentile ?? null,
      heightPercentile: data.heightPercentile ?? null,
      diaperSize: diaperSize,
      notes: "Initial measurement",
    });
  }

  res.status(201).json(formatBaby(baby));
});

router.get("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const id = Number(req.params.id);
  const [baby] = await db.select().from(babiesTable).where(and(eq(babiesTable.id, id), eq(babiesTable.userId, userId)));
  if (!baby) return res.status(404).json({ error: "Not found" });
  res.json(formatBaby(baby));
});

router.patch("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const id = Number(req.params.id);
  const schema = z.object({
    name: z.string().optional(),
    birthDate: z.string().optional(),
    gender: z.string().optional(),
    avatarEmoji: z.string().optional(),
    currentWeightLbs: z.number().optional(),
    currentHeightIn: z.number().optional(),
    weightPercentile: z.number().optional(),
    heightPercentile: z.number().optional(),
    currentDiaperSize: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const data = parsed.data;
  const updateData: Record<string, unknown> = { ...data };
  if (data.currentWeightLbs && !data.currentDiaperSize) {
    updateData.currentDiaperSize = calcDiaperSize(data.currentWeightLbs);
  }

  const [baby] = await db.update(babiesTable).set(updateData).where(and(eq(babiesTable.id, id), eq(babiesTable.userId, userId))).returning();
  if (!baby) return res.status(404).json({ error: "Not found" });
  res.json(formatBaby(baby));
});

router.delete("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const id = Number(req.params.id);
  await db.delete(babiesTable).where(and(eq(babiesTable.id, id), eq(babiesTable.userId, userId)));
  res.status(204).send();
});

function formatBaby(baby: typeof babiesTable.$inferSelect) {
  return {
    id: baby.id,
    name: baby.name,
    birthDate: baby.birthDate,
    gender: baby.gender,
    avatarEmoji: baby.avatarEmoji,
    currentWeightLbs: baby.currentWeightLbs,
    currentHeightIn: baby.currentHeightIn,
    weightPercentile: baby.weightPercentile,
    heightPercentile: baby.heightPercentile,
    currentHeightPercentile: baby.heightPercentile != null
      ? baby.heightPercentile
      : baby.currentHeightIn != null
        ? calcPercentileForHeight(ageInMonths(baby.birthDate), baby.currentHeightIn)
        : null,
    currentDiaperSize: baby.currentDiaperSize,
    notes: baby.notes,
    createdAt: baby.createdAt.toISOString(),
  };
}

export function calcDiaperSize(weightLbs: number): string {
  if (weightLbs < 6) return "Preemie";
  if (weightLbs < 8) return "Newborn";
  if (weightLbs < 12) return "Size 1";
  if (weightLbs < 16) return "Size 2";
  if (weightLbs < 25) return "Size 3";
  if (weightLbs < 32) return "Size 4";
  if (weightLbs < 38) return "Size 5";
  return "Size 6";
}

export default router;
