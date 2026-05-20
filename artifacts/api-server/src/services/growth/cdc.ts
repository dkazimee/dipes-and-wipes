/**
 * CDC growth chart data and calculation functions.
 *
 * Data sourced from the CDC Clinical Growth Charts (Kuczmarski et al., 2000,
 * Vital and Health Statistics, Series 11, No. 246).
 *
 * All heights are in inches, weights are in pounds.
 * Age is in completed months.
 *
 * Gender-specific tables are used when gender is known ("male" / "female").
 * A combined (average) table is used as a fallback when gender is unknown.
 *
 * Available percentile columns: 5, 10, 25, 50, 75, 90, 95.
 */

const CDC_PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const;
type CdcPercentile = (typeof CDC_PERCENTILES)[number];

// ─── Weight-for-age ──────────────────────────────────────────────────────────

interface CdcWeightPoint {
  ageMonths: number;
  weights: Record<CdcPercentile, number>;
}

const CDC_WEIGHT_GIRLS: CdcWeightPoint[] = [
  { ageMonths: 0,  weights: { 5: 5.3,  10: 5.6,  25: 6.3,  50: 7.3,  75: 8.3,  90: 9.1,  95: 9.6  } },
  { ageMonths: 1,  weights: { 5: 7.0,  10: 7.4,  25: 8.4,  50: 9.6,  75: 10.8, 90: 11.8, 95: 12.4 } },
  { ageMonths: 2,  weights: { 5: 8.6,  10: 9.0,  25: 10.2, 50: 11.5, 75: 12.9, 90: 14.1, 95: 14.8 } },
  { ageMonths: 3,  weights: { 5: 9.8,  10: 10.3, 25: 11.5, 50: 12.9, 75: 14.5, 90: 15.8, 95: 16.6 } },
  { ageMonths: 4,  weights: { 5: 10.7, 10: 11.3, 25: 12.5, 50: 14.1, 75: 15.8, 90: 17.2, 95: 18.1 } },
  { ageMonths: 5,  weights: { 5: 11.5, 10: 12.1, 25: 13.4, 50: 15.1, 75: 16.9, 90: 18.4, 95: 19.4 } },
  { ageMonths: 6,  weights: { 5: 12.2, 10: 12.9, 25: 14.3, 50: 16.1, 75: 18.0, 90: 19.6, 95: 20.6 } },
  { ageMonths: 9,  weights: { 5: 14.0, 10: 14.7, 25: 16.3, 50: 18.3, 75: 20.5, 90: 22.3, 95: 23.5 } },
  { ageMonths: 12, weights: { 5: 15.6, 10: 16.4, 25: 18.1, 50: 20.3, 75: 22.7, 90: 24.7, 95: 26.0 } },
  { ageMonths: 15, weights: { 5: 16.8, 10: 17.7, 25: 19.5, 50: 21.8, 75: 24.4, 90: 26.6, 95: 28.0 } },
  { ageMonths: 18, weights: { 5: 17.9, 10: 18.9, 25: 20.8, 50: 23.3, 75: 26.1, 90: 28.4, 95: 30.0 } },
  { ageMonths: 24, weights: { 5: 19.8, 10: 20.9, 25: 23.1, 50: 26.0, 75: 29.2, 90: 31.9, 95: 33.6 } },
  { ageMonths: 30, weights: { 5: 21.5, 10: 22.8, 25: 25.4, 50: 28.7, 75: 32.4, 90: 35.5, 95: 37.5 } },
  { ageMonths: 36, weights: { 5: 23.2, 10: 24.7, 25: 27.7, 50: 31.4, 75: 35.7, 90: 39.2, 95: 41.5 } },
];

const CDC_WEIGHT_BOYS: CdcWeightPoint[] = [
  { ageMonths: 0,  weights: { 5: 5.5,  10: 5.8,  25: 6.6,  50: 7.5,  75: 8.4,  90: 9.2,  95: 9.7  } },
  { ageMonths: 1,  weights: { 5: 7.4,  10: 7.8,  25: 8.7,  50: 9.9,  75: 11.0, 90: 12.0, 95: 12.6 } },
  { ageMonths: 2,  weights: { 5: 9.2,  10: 9.7,  25: 10.9, 50: 12.3, 75: 13.7, 90: 14.9, 95: 15.6 } },
  { ageMonths: 3,  weights: { 5: 10.5, 10: 11.0, 25: 12.3, 50: 13.9, 75: 15.4, 90: 16.8, 95: 17.6 } },
  { ageMonths: 4,  weights: { 5: 11.6, 10: 12.1, 25: 13.5, 50: 15.2, 75: 16.9, 90: 18.4, 95: 19.3 } },
  { ageMonths: 5,  weights: { 5: 12.5, 10: 13.1, 25: 14.6, 50: 16.5, 75: 18.3, 90: 19.9, 95: 20.9 } },
  { ageMonths: 6,  weights: { 5: 13.4, 10: 14.0, 25: 15.6, 50: 17.5, 75: 19.5, 90: 21.2, 95: 22.2 } },
  { ageMonths: 9,  weights: { 5: 15.4, 10: 16.1, 25: 17.9, 50: 20.1, 75: 22.3, 90: 24.2, 95: 25.4 } },
  { ageMonths: 12, weights: { 5: 17.1, 10: 17.9, 25: 19.8, 50: 22.0, 75: 24.3, 90: 26.3, 95: 27.6 } },
  { ageMonths: 15, weights: { 5: 18.4, 10: 19.3, 25: 21.4, 50: 23.8, 75: 26.3, 90: 28.5, 95: 30.0 } },
  { ageMonths: 18, weights: { 5: 19.6, 10: 20.6, 25: 22.8, 50: 25.4, 75: 28.1, 90: 30.5, 95: 32.1 } },
  { ageMonths: 24, weights: { 5: 21.8, 10: 22.9, 25: 25.5, 50: 28.4, 75: 31.5, 90: 34.3, 95: 36.2 } },
  { ageMonths: 30, weights: { 5: 24.0, 10: 25.2, 25: 28.1, 50: 31.5, 75: 35.3, 90: 38.6, 95: 40.8 } },
  { ageMonths: 36, weights: { 5: 26.2, 10: 27.6, 25: 30.9, 50: 34.9, 75: 39.3, 90: 43.3, 95: 45.9 } },
];

// ─── Height-for-age ───────────────────────────────────────────────────────────

interface CdcHeightPoint {
  ageMonths: number;
  heights: Record<CdcPercentile, number>;
}

const CDC_HEIGHT_GIRLS: CdcHeightPoint[] = [
  { ageMonths: 0,  heights: { 5: 18.1, 10: 18.5, 25: 19.0, 50: 19.6, 75: 20.2, 90: 20.7, 95: 21.0 } },
  { ageMonths: 2,  heights: { 5: 21.0, 10: 21.4, 25: 21.9, 50: 22.7, 75: 23.4, 90: 24.0, 95: 24.4 } },
  { ageMonths: 4,  heights: { 5: 22.9, 10: 23.3, 25: 23.9, 50: 24.7, 75: 25.5, 90: 26.2, 95: 26.6 } },
  { ageMonths: 6,  heights: { 5: 24.5, 10: 24.9, 25: 25.6, 50: 26.4, 75: 27.3, 90: 28.0, 95: 28.5 } },
  { ageMonths: 9,  heights: { 5: 26.3, 10: 26.7, 25: 27.5, 50: 28.4, 75: 29.4, 90: 30.1, 95: 30.6 } },
  { ageMonths: 12, heights: { 5: 27.8, 10: 28.2, 25: 29.0, 50: 29.9, 75: 30.9, 90: 31.7, 95: 32.1 } },
  { ageMonths: 15, heights: { 5: 29.0, 10: 29.5, 25: 30.3, 50: 31.2, 75: 32.3, 90: 33.1, 95: 33.6 } },
  { ageMonths: 18, heights: { 5: 30.2, 10: 30.7, 25: 31.5, 50: 32.5, 75: 33.6, 90: 34.4, 95: 34.9 } },
  { ageMonths: 24, heights: { 5: 32.0, 10: 32.4, 25: 33.2, 50: 34.1, 75: 35.0, 90: 35.8, 95: 36.4 } },
  { ageMonths: 30, heights: { 5: 33.8, 10: 34.2, 25: 35.0, 50: 36.1, 75: 37.0, 90: 37.9, 95: 38.5 } },
  { ageMonths: 36, heights: { 5: 35.5, 10: 36.0, 25: 36.8, 50: 37.9, 75: 38.9, 90: 39.7, 95: 40.3 } },
];

const CDC_HEIGHT_BOYS: CdcHeightPoint[] = [
  { ageMonths: 0,  heights: { 5: 18.5, 10: 18.9, 25: 19.4, 50: 20.0, 75: 20.6, 90: 21.1, 95: 21.5 } },
  { ageMonths: 2,  heights: { 5: 21.5, 10: 22.0, 25: 22.7, 50: 23.5, 75: 24.3, 90: 24.9, 95: 25.4 } },
  { ageMonths: 4,  heights: { 5: 23.5, 10: 24.0, 25: 24.7, 50: 25.5, 75: 26.3, 90: 27.0, 95: 27.4 } },
  { ageMonths: 6,  heights: { 5: 25.1, 10: 25.6, 25: 26.3, 50: 27.2, 75: 28.0, 90: 28.7, 95: 29.1 } },
  { ageMonths: 9,  heights: { 5: 27.0, 10: 27.5, 25: 28.3, 50: 29.2, 75: 30.1, 90: 30.8, 95: 31.3 } },
  { ageMonths: 12, heights: { 5: 28.5, 10: 29.0, 25: 29.8, 50: 30.8, 75: 31.7, 90: 32.5, 95: 33.0 } },
  { ageMonths: 15, heights: { 5: 29.8, 10: 30.3, 25: 31.2, 50: 32.1, 75: 33.1, 90: 34.0, 95: 34.5 } },
  { ageMonths: 18, heights: { 5: 31.0, 10: 31.6, 25: 32.5, 50: 33.5, 75: 34.5, 90: 35.4, 95: 35.9 } },
  { ageMonths: 24, heights: { 5: 33.0, 10: 33.5, 25: 34.4, 50: 35.4, 75: 36.4, 90: 37.3, 95: 37.8 } },
  { ageMonths: 30, heights: { 5: 34.6, 10: 35.1, 25: 36.1, 50: 37.2, 75: 38.3, 90: 39.2, 95: 39.8 } },
  { ageMonths: 36, heights: { 5: 36.2, 10: 36.7, 25: 37.7, 50: 38.8, 75: 39.9, 90: 40.8, 95: 41.4 } },
];

// ─── Gender selection helpers ─────────────────────────────────────────────────

type Gender = "male" | "female" | null | undefined;

function weightTable(gender: Gender): CdcWeightPoint[] {
  if (gender === "female") return CDC_WEIGHT_GIRLS;
  if (gender === "male")   return CDC_WEIGHT_BOYS;
  return CDC_WEIGHT_BOYS.map((row, i) => ({
    ageMonths: row.ageMonths,
    weights: Object.fromEntries(
      CDC_PERCENTILES.map(p => [p, (row.weights[p] + CDC_WEIGHT_GIRLS[i].weights[p]) / 2])
    ) as Record<CdcPercentile, number>,
  }));
}

function heightTable(gender: Gender): CdcHeightPoint[] {
  if (gender === "female") return CDC_HEIGHT_GIRLS;
  if (gender === "male")   return CDC_HEIGHT_BOYS;
  return CDC_HEIGHT_BOYS.map((row, i) => ({
    ageMonths: row.ageMonths,
    heights: Object.fromEntries(
      CDC_PERCENTILES.map(p => [p, (row.heights[p] + CDC_HEIGHT_GIRLS[i].heights[p]) / 2])
    ) as Record<CdcPercentile, number>,
  }));
}

// ─── Interpolation helpers ────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bracketWeight(ageMonths: number, gender: Gender): {
  lower: CdcWeightPoint; upper: CdcWeightPoint; t: number;
} {
  const data = weightTable(gender);
  for (let i = 0; i < data.length - 1; i++) {
    const lo = data[i], hi = data[i + 1];
    if (ageMonths >= lo.ageMonths && ageMonths <= hi.ageMonths) {
      return { lower: lo, upper: hi, t: (ageMonths - lo.ageMonths) / (hi.ageMonths - lo.ageMonths) };
    }
  }
  if (ageMonths <= data[0].ageMonths) {
    const first = data[0];
    return { lower: first, upper: first, t: 0 };
  }
  const prev = data[data.length - 2];
  const last = data[data.length - 1];
  const interval = last.ageMonths - prev.ageMonths;
  const extrapolated: CdcWeightPoint = {
    ageMonths: last.ageMonths + interval,
    weights: Object.fromEntries(
      CDC_PERCENTILES.map(p => [p, 2 * last.weights[p] - prev.weights[p]])
    ) as Record<CdcPercentile, number>,
  };
  return { lower: last, upper: extrapolated, t: (ageMonths - last.ageMonths) / interval };
}

function bracketHeight(ageMonths: number, gender: Gender): {
  lower: CdcHeightPoint; upper: CdcHeightPoint; t: number;
} {
  const data = heightTable(gender);
  for (let i = 0; i < data.length - 1; i++) {
    const lo = data[i], hi = data[i + 1];
    if (ageMonths >= lo.ageMonths && ageMonths <= hi.ageMonths) {
      return { lower: lo, upper: hi, t: (ageMonths - lo.ageMonths) / (hi.ageMonths - lo.ageMonths) };
    }
  }
  if (ageMonths <= data[0].ageMonths) {
    const first = data[0];
    return { lower: first, upper: first, t: 0 };
  }
  const prev = data[data.length - 2];
  const last = data[data.length - 1];
  const interval = last.ageMonths - prev.ageMonths;
  const extrapolated: CdcHeightPoint = {
    ageMonths: last.ageMonths + interval,
    heights: Object.fromEntries(
      CDC_PERCENTILES.map(p => [p, 2 * last.heights[p] - prev.heights[p]])
    ) as Record<CdcPercentile, number>,
  };
  return { lower: last, upper: extrapolated, t: (ageMonths - last.ageMonths) / interval };
}

function calcPercentileFromCurve(
  measurement: number,
  curve: Array<{ pct: number; val: number }>,
): number {
  if (measurement <= curve[0].val) return Math.max(2, 5 * (measurement / curve[0].val));
  if (measurement >= curve[curve.length - 1].val) return 98;
  for (let i = 0; i < curve.length - 1; i++) {
    const lo = curve[i], hi = curve[i + 1];
    if (measurement >= lo.val && measurement <= hi.val) {
      const t = (measurement - lo.val) / (hi.val - lo.val);
      return Math.round(lerp(lo.pct, hi.pct, t));
    }
  }
  return 50;
}

function predictFromCurve(
  percentile: number,
  low: number,
  high: number,
  pctLow: CdcPercentile,
  pctHigh: CdcPercentile,
): number {
  const t = (percentile - pctLow) / (pctHigh - pctLow);
  return Math.round(lerp(low, high, t) * 10) / 10;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function predictWeightLbs(ageMonths: number, percentile: number, gender?: Gender): number {
  const clamped = Math.max(5, Math.min(percentile, 95));
  const { lower, upper, t } = bracketWeight(ageMonths, gender);
  let pctLow: CdcPercentile = 5, pctHigh: CdcPercentile = 95;
  for (let i = 0; i < CDC_PERCENTILES.length - 1; i++) {
    const lo = CDC_PERCENTILES[i], hi = CDC_PERCENTILES[i + 1];
    if (clamped >= lo && clamped <= hi) { pctLow = lo; pctHigh = hi; break; }
  }
  const pctT = (clamped - pctLow) / (pctHigh - pctLow);
  const wLow  = lerp(lower.weights[pctLow],  upper.weights[pctLow],  t);
  const wHigh = lerp(lower.weights[pctHigh], upper.weights[pctHigh], t);
  return Math.round(lerp(wLow, wHigh, pctT) * 10) / 10;
}

export function calcPercentileForWeight(ageMonths: number, weightLbs: number, gender?: Gender): number {
  const { lower, upper, t } = bracketWeight(ageMonths, gender);
  const curve = CDC_PERCENTILES.map(p => ({ pct: p, val: lerp(lower.weights[p], upper.weights[p], t) }));
  return calcPercentileFromCurve(weightLbs, curve);
}

export function predictHeightIn(ageMonths: number, percentile: number, gender?: Gender): number {
  const clamped = Math.max(5, Math.min(percentile, 95));
  const { lower, upper, t } = bracketHeight(ageMonths, gender);
  let pctLow: CdcPercentile = 5, pctHigh: CdcPercentile = 95;
  for (let i = 0; i < CDC_PERCENTILES.length - 1; i++) {
    const lo = CDC_PERCENTILES[i], hi = CDC_PERCENTILES[i + 1];
    if (clamped >= lo && clamped <= hi) { pctLow = lo; pctHigh = hi; break; }
  }
  const hLow  = lerp(lower.heights[pctLow],  upper.heights[pctLow],  t);
  const hHigh = lerp(lower.heights[pctHigh], upper.heights[pctHigh], t);
  return predictFromCurve(clamped, hLow, hHigh, pctLow, pctHigh);
}

export function calcPercentileForHeight(ageMonths: number, heightIn: number, gender?: Gender): number {
  const { lower, upper, t } = bracketHeight(ageMonths, gender);
  const curve = CDC_PERCENTILES.map(p => ({ pct: p, val: lerp(lower.heights[p], upper.heights[p], t) }));
  return calcPercentileFromCurve(heightIn, curve);
}

export function ageInMonths(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth()) +
    (now.getDate() - birth.getDate()) / 30;
  return Math.max(0, months);
}

export function ageInMonthsAt(birthDate: string, atDate: string): number {
  const birth = new Date(birthDate);
  const target = new Date(atDate);
  const months =
    (target.getFullYear() - birth.getFullYear()) * 12 +
    (target.getMonth() - birth.getMonth()) +
    (target.getDate() - birth.getDate()) / 30;
  return Math.max(0, months);
}

// ─── Wipes & diapers estimates ────────────────────────────────────────────────

interface WipesBracket {
  minMonths: number;
  maxMonths: number;
  changesPerDay: number;
  wipesPerMonth: number;
  label: string;
}

const WIPES_BRACKETS: WipesBracket[] = [
  { minMonths: 0,  maxMonths: 1,        changesPerDay: 11,  wipesPerMonth: 1400, label: "newborn"        },
  { minMonths: 1,  maxMonths: 3,        changesPerDay: 9,   wipesPerMonth: 1080, label: "early infant"   },
  { minMonths: 3,  maxMonths: 6,        changesPerDay: 7,   wipesPerMonth: 840,  label: "infant"         },
  { minMonths: 6,  maxMonths: 12,       changesPerDay: 5.5, wipesPerMonth: 660,  label: "older infant"   },
  { minMonths: 12, maxMonths: 18,       changesPerDay: 4.5, wipesPerMonth: 540,  label: "young toddler"  },
  { minMonths: 18, maxMonths: 24,       changesPerDay: 4,   wipesPerMonth: 480,  label: "toddler"        },
  { minMonths: 24, maxMonths: 36,       changesPerDay: 2.5, wipesPerMonth: 300,  label: "older toddler"  },
  { minMonths: 36, maxMonths: Infinity, changesPerDay: 1.5, wipesPerMonth: 180,  label: "potty training" },
];

export interface WipesEstimate {
  changesPerDay: number;
  wipesPerMonth: number;
  label: string;
}

export function calcWipesPerMonth(ageMonths: number): WipesEstimate {
  const bracket =
    WIPES_BRACKETS.find(b => ageMonths >= b.minMonths && ageMonths < b.maxMonths) ??
    WIPES_BRACKETS[WIPES_BRACKETS.length - 1];
  return { changesPerDay: bracket.changesPerDay, wipesPerMonth: bracket.wipesPerMonth, label: bracket.label };
}

export interface DiapersEstimate {
  changesPerDay: number;
  diapersPerMonth: number;
  label: string;
}

export function calcDiapersPerMonth(ageMonths: number): DiapersEstimate {
  const bracket =
    WIPES_BRACKETS.find(b => ageMonths >= b.minMonths && ageMonths < b.maxMonths) ??
    WIPES_BRACKETS[WIPES_BRACKETS.length - 1];
  return {
    changesPerDay: bracket.changesPerDay,
    diapersPerMonth: Math.round(bracket.changesPerDay * 30),
    label: bracket.label,
  };
}

export function predictDiaperSizeAtDate(
  birthDate: string,
  targetDate: string,
  opts: {
    weightPercentile?: number | null;
    currentWeightLbs?: number | null;
    gender?: string | null;
  } = {},
): string {
  const gender = opts.gender as "male" | "female" | null | undefined;
  const currentAgeMonths = ageInMonths(birthDate);
  const targetAgeMonths = ageInMonthsAt(birthDate, targetDate);

  let usedPercentile: number;
  if (opts.weightPercentile != null) {
    usedPercentile = opts.weightPercentile;
  } else if (opts.currentWeightLbs != null) {
    usedPercentile = calcPercentileForWeight(currentAgeMonths, opts.currentWeightLbs, gender);
  } else {
    usedPercentile = 50;
  }

  const weightAtTarget = predictWeightLbs(targetAgeMonths, usedPercentile, gender);

  if (weightAtTarget < 6)  return "Preemie";
  if (weightAtTarget < 8)  return "Newborn";
  if (weightAtTarget < 12) return "Size 1";
  if (weightAtTarget < 16) return "Size 2";
  if (weightAtTarget < 25) return "Size 3";
  if (weightAtTarget < 32) return "Size 4";
  if (weightAtTarget < 38) return "Size 5";
  return "Size 6";
}
