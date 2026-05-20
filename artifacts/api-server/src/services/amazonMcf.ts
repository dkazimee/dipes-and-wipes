/**
 * Amazon Multi-Channel Fulfillment (MCF) service.
 *
 * Uses the Selling Partner API (SP-API) Fulfillment Outbound v2020-07-01.
 *
 * Required environment variables (set in Replit Secrets — never hardcode):
 *   AMAZON_REFRESH_TOKEN      — SP-API refresh token from Seller Central
 *   AMAZON_LWA_CLIENT_ID      — Login with Amazon app client ID
 *   AMAZON_LWA_CLIENT_SECRET  — Login with Amazon app client secret
 *   AMAZON_MARKETPLACE_ID     — Marketplace ID (US default: ATVPDKIKX0DER)
 *   AMAZON_SP_API_ENDPOINT    — SP-API base URL (default: https://sellingpartnerapi-na.amazon.com)
 */

import { spApiRequest } from "./amazonAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface McfOrderItem {
  /** The amazonSellerSku mapped from the internal product SKU — never from user input */
  sellerSku: string;
  /** Unique item line ID within this order */
  sellerFulfillmentOrderItemId: string;
  quantity: number;
}

export interface McfAddress {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrRegion: string;
  postalCode: string;
  countryCode: string;
}

export interface McfOrderInput {
  /** Unique order identifier for idempotency — use "dw-order-{id}" */
  sellerFulfillmentOrderId: string;
  displayableOrderId: string;
  displayableOrderDate: string; // ISO-8601
  displayableOrderComment?: string;
  /** "Standard" | "Expedited" | "Priority" */
  shippingSpeedCategory: string;
  destinationAddress: McfAddress;
  items: McfOrderItem[];
  marketplaceId?: string;
}

export interface McfFulfillmentOrderItem {
  sellerSku: string;
  quantity: number;
  cancelledQuantity?: number;
  unfulfillableQuantity?: number;
}

export interface McfFulfillmentOrder {
  sellerFulfillmentOrderId: string;
  fulfillmentOrderStatus: string;
  statusUpdatedDate?: string;
  fulfillmentShipments?: Array<{
    amazonShipmentId: string;
    fulfillmentCenterId: string;
    fulfillmentShipmentStatus: string;
    shippingDate?: string;
    estimatedArrivalDate?: string;
    fulfillmentShipmentPackage?: Array<{
      packageNumber: number;
      carrierCode: string;
      trackingNumber?: string;
      estimatedArrivalDate?: string;
    }>;
  }>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an Amazon MCF fulfillment order.
 *
 * SECURITY GUARDRAIL: `items[].sellerSku` must always be populated by the
 * backend from the `amazonSellerSku` column of the `productsTable`.
 * Never pass a SKU value that came directly from the frontend request body.
 */
export async function createMcfOrder(input: McfOrderInput): Promise<void> {
  const marketplaceId =
    input.marketplaceId ??
    process.env.AMAZON_MARKETPLACE_ID ??
    "ATVPDKIKX0DER"; // US marketplace default

  await spApiRequest<unknown>(
    "POST",
    "/fba/outbound/2020-07-01/fulfillmentOrders",
    {
      marketplaceId,
      sellerFulfillmentOrderId: input.sellerFulfillmentOrderId,
      displayableOrderId: input.displayableOrderId,
      displayableOrderDate: input.displayableOrderDate,
      displayableOrderComment: input.displayableOrderComment ?? "Dipes & Wipes subscription order",
      shippingSpeedCategory: input.shippingSpeedCategory,
      destinationAddress: input.destinationAddress,
      items: input.items,
    },
  );
}

/**
 * Retrieve the current status of an Amazon MCF fulfillment order.
 */
export async function getMcfOrder(sellerFulfillmentOrderId: string): Promise<McfFulfillmentOrder> {
  const data = await spApiRequest<{ payload: { fulfillmentOrder: McfFulfillmentOrder } }>(
    "GET",
    `/fba/outbound/2020-07-01/fulfillmentOrders/${encodeURIComponent(sellerFulfillmentOrderId)}`,
  );
  return data.payload.fulfillmentOrder;
}

/**
 * Extract the first tracking number from an MCF order, if available.
 */
export function extractTrackingNumber(order: McfFulfillmentOrder): string | null {
  for (const shipment of order.fulfillmentShipments ?? []) {
    for (const pkg of shipment.fulfillmentShipmentPackage ?? []) {
      if (pkg.trackingNumber) return pkg.trackingNumber;
    }
  }
  return null;
}

/**
 * Map Amazon MCF fulfillmentOrderStatus to the app's local order status.
 *
 * MCF statuses: RECEIVED | INVALID | PLANNING | PROCESSING | CANCELLED |
 *               COMPLETE | COMPLETE_PARTIALLED | UNFULFILLABLE
 */
export function mapMcfStatus(mcfStatus: string): string {
  const map: Record<string, string> = {
    RECEIVED: "processing",
    INVALID: "failed",
    PLANNING: "processing",
    PROCESSING: "processing",
    CANCELLED: "cancelled",
    COMPLETE: "delivered",
    COMPLETE_PARTIALLED: "delivered",
    UNFULFILLABLE: "failed",
  };
  return map[mcfStatus.toUpperCase()] ?? "processing";
}
