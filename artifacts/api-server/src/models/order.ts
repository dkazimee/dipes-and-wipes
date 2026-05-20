export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "failed"
  | "fulfillment_error";

export type FulfillmentProviderName = "amazon-mcf" | "shipbob";

export interface Order {
  id: number;
  subscriptionId: number | null;
  userId: string | null;
  status: OrderStatus;
  scheduledDate: string;
  diaperSize: string | null;
  totalCents: number | null;
  trackingNumber: string | null;
  carrier: string | null;
  fulfillmentProvider: FulfillmentProviderName | null;
  fulfillmentId: string | null;
  fulfillmentStatus: string | null;
  fulfillmentErrorMessage: string | null;
  shippingName: string | null;
  shippingAddress1: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shippingCountry: string | null;
  createdAt: string;
}
