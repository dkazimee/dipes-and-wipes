export type SubscriptionStatus = "active" | "paused" | "cancelled";
export type SubscriptionFrequency = "monthly" | "biweekly";

export interface SubscriptionItem {
  productId: number;
  productName: string | null;
  quantity: number;
  priceCents: number | null;
}

export interface Subscription {
  id: number;
  babyId: number;
  babyName: string | null;
  status: SubscriptionStatus;
  frequency: SubscriptionFrequency;
  brand: string | null;
  currentDiaperSize: string | null;
  nextDeliveryDate: string;
  monthlyPriceCents: number | null;
  shippingName: string | null;
  shippingAddress1: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shippingCountry: string | null;
  items: SubscriptionItem[];
  createdAt: string;
}
