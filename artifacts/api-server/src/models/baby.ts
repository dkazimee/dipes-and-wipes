export type BabyGender = "male" | "female" | null;

export interface Baby {
  id: number;
  userId: string;
  name: string;
  birthDate: string;
  gender: BabyGender;
  currentWeightLbs: number | null;
  currentHeightIn: number | null;
  weightPercentile: number | null;
  heightPercentile: number | null;
  avatar: string | null;
  createdAt: string;
}

export type DiapserSize =
  | "Preemie"
  | "Newborn"
  | "Size 1"
  | "Size 2"
  | "Size 3"
  | "Size 4"
  | "Size 5"
  | "Size 6";

export interface GrowthEntry {
  id: number;
  babyId: number;
  date: string;
  weightLbs: number | null;
  heightIn: number | null;
  notes: string | null;
  createdAt: string;
}
