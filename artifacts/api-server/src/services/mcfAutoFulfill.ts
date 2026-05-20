/**
 * Shared Amazon MCF auto-fulfillment logic.
 *
 * Used by:
 *   - POST /subscriptions   — fire-and-forget on subscription creation
 *   - POST /orders/:id/fulfill-amazon — manual fulfillment with optional overrides
 *   - POST /orders/process-pending   — batch cron-style processor
 *
 * On success the order moves to status="processing".
 * On failure it moves to status="fulfillment_error" with a human-readable
 * reason stored in fulfillmentErrorMessage.
 *
 * SECURITY: amazon_seller_sku is resolved entirely from the approved_skus
 * table — it is never accepted from user input anywhere in this flow.
 */
import { db } from "@workspace/db";
import {
  ordersTable,
  subscriptionsTable,
  subscriptionItemsTable,
  productsTable,
  approvedSkusTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { createMcfOrder } from "./amazonMcf";
import { logger } from "../lib/logger";

// ── Public types ──────────────────────────────────────────────────────────────

/** Machine-readable reason for a skipped (not-submitted) result. */
export type McfSkipCode =
  | "not_found"        // orderId does not exist
  | "already_submitted" // order already has a fulfillmentId
  | "no_address"       // no resolvable shipping address
  | "no_items";        // subscription has no items

export interface McfAutoFulfillOptions {
  shippingSpeed?: "Standard" | "Expedited" | "Priority";
  /**
   * Address fields to prefer over what is stored on the order/subscription.
   * Any null/undefined values fall through to stored values.
   */
  addressOverride?: {
    shippingName?: string | null;
    shippingAddress1?: string | null;
    shippingCity?: string | null;
    shippingState?: string | null;
    shippingZip?: string | null;
    shippingCountry?: string | null;
  };
}

export interface McfAutoFulfillResult {
  orderId: number;
  success: boolean;
  /** true when the order was intentionally not submitted — check skipCode/skipReason */
  skipped: boolean;
  /** Machine-readable skip category (set when skipped=true) */
  skipCode?: McfSkipCode;
  /** Human-readable explanation (set when skipped=true) */
  skipReason?: string;
  /** Error message written to fulfillmentErrorMessage (set when success=false and skipped=false) */
  error?: string;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Try to auto-submit a single order to Amazon MCF.
 *
 * Skips silently (does NOT update the order) when:
 *   - The order is not found
 *   - The order already has a fulfillmentId (already submitted)
 *   - No shipping address can be resolved (stays pending for later retry)
 *   - The subscription has no items
 *
 * Writes fulfillment_error (updates the order) when:
 *   - A product has no approved_skus row
 *   - A product's approved SKU is inactive
 *   - A product exceeds its max_quantity_per_order
 *   - The MCF API call fails (network, auth, etc.)
 */
export async function tryAutoFulfillMcf(
  orderId: number,
  opts?: McfAutoFulfillOptions,
): Promise<McfAutoFulfillResult> {
  // ── 1. Load order ──────────────────────────────────────────────────────────
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    return { orderId, success: false, skipped: true, skipCode: "not_found", skipReason: "Order not found" };
  }
  if (order.fulfillmentId) {
    return {
      orderId,
      success: false,
      skipped: true,
      skipCode: "already_submitted",
      skipReason: "Order already submitted to fulfillment",
    };
  }

  // ── 2. Resolve shipping address ────────────────────────────────────────────
  // Priority: addressOverride > order stored fields > subscription stored fields
  const ov = opts?.addressOverride ?? {};
  let addr = {
    shippingName:     ov.shippingName     || order.shippingName,
    shippingAddress1: ov.shippingAddress1 || order.shippingAddress1,
    shippingCity:     ov.shippingCity     || order.shippingCity,
    shippingState:    ov.shippingState    || order.shippingState,
    shippingZip:      ov.shippingZip      || order.shippingZip,
    shippingCountry:  ov.shippingCountry  || order.shippingCountry || "US",
  };

  if (!addr.shippingName || !addr.shippingAddress1) {
    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, order.subscriptionId!));
    if (sub) {
      addr.shippingName     = addr.shippingName     || sub.shippingName;
      addr.shippingAddress1 = addr.shippingAddress1 || sub.shippingAddress1;
      addr.shippingCity     = addr.shippingCity     || sub.shippingCity;
      addr.shippingState    = addr.shippingState    || sub.shippingState;
      addr.shippingZip      = addr.shippingZip      || sub.shippingZip;
      addr.shippingCountry  = addr.shippingCountry  || sub.shippingCountry || "US";
    }
  }

  if (!addr.shippingName || !addr.shippingAddress1 || !addr.shippingCity || !addr.shippingState || !addr.shippingZip) {
    // Stay pending — an address must be added before this order can ship.
    return {
      orderId,
      success: false,
      skipped: true,
      skipCode: "no_address",
      skipReason: "No shipping address found. Add a shipping address to the subscription or provide one here.",
    };
  }

  // ── 3. Gather subscription items and validate against approved_skus whitelist ─
  const items = await db
    .select({
      quantity:            subscriptionItemsTable.quantity,
      productId:           subscriptionItemsTable.productId,
      productName:         productsTable.name,
      internalSku:         productsTable.sku,
      approvedSkuId:       approvedSkusTable.id,
      amazonSellerSku:     approvedSkusTable.amazonSellerSku,
      active:              approvedSkusTable.active,
      maxQuantityPerOrder: approvedSkusTable.maxQuantityPerOrder,
    })
    .from(subscriptionItemsTable)
    .innerJoin(productsTable, eq(subscriptionItemsTable.productId, productsTable.id))
    .leftJoin(approvedSkusTable, eq(productsTable.sku, approvedSkusTable.internalSku))
    .where(eq(subscriptionItemsTable.subscriptionId, order.subscriptionId!));

  if (items.length === 0) {
    return {
      orderId,
      success: false,
      skipped: true,
      skipCode: "no_items",
      skipReason: "Subscription has no items",
    };
  }

  // Whitelist checks
  const unapproved = items.filter(i => i.approvedSkuId == null);
  if (unapproved.length > 0) {
    return markError(
      orderId,
      `Products not configured for Amazon fulfillment: ${unapproved.map(i => i.productName).join(", ")}`,
    );
  }

  const inactive = items.filter(i => !i.active);
  if (inactive.length > 0) {
    return markError(
      orderId,
      `Products no longer available: ${inactive.map(i => i.productName).join(", ")}`,
    );
  }

  const overQty = items.filter(i => i.maxQuantityPerOrder != null && i.quantity > i.maxQuantityPerOrder);
  if (overQty.length > 0) {
    return markError(
      orderId,
      `Products exceed max quantity per order: ${overQty.map(i => `${i.productName} (max ${i.maxQuantityPerOrder})`).join(", ")}`,
    );
  }

  // ── 4. Submit to Amazon MCF ────────────────────────────────────────────────
  const sellerFulfillmentOrderId = `dw-order-${orderId}`;
  const mcfItems = items.map((item, idx) => ({
    sellerSku: item.amazonSellerSku!, // guaranteed non-null after whitelist checks above
    sellerFulfillmentOrderItemId: `dw-${orderId}-item-${idx + 1}`,
    quantity: item.quantity,
  }));

  try {
    await createMcfOrder({
      sellerFulfillmentOrderId,
      displayableOrderId: `DW-${orderId}`,
      displayableOrderDate: new Date().toISOString(),
      shippingSpeedCategory: opts?.shippingSpeed ?? "Standard",
      destinationAddress: {
        name:           addr.shippingName,
        addressLine1:   addr.shippingAddress1,
        city:           addr.shippingCity,
        stateOrRegion:  addr.shippingState,
        postalCode:     addr.shippingZip,
        countryCode:    addr.shippingCountry,
      },
      items: mcfItems,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Amazon MCF API error";
    logger.error({ err, orderId }, "MCF auto-fulfillment API call failed");
    return markError(orderId, msg);
  }

  // ── 5. Update order on success ─────────────────────────────────────────────
  await db
    .update(ordersTable)
    .set({
      fulfillmentProvider:    "amazon-mcf",
      fulfillmentId:          sellerFulfillmentOrderId,
      fulfillmentStatus:      "RECEIVED",
      fulfillmentErrorMessage: null,
      status:                 "processing",
      shippingName:           addr.shippingName,
      shippingAddress1:       addr.shippingAddress1,
      shippingCity:           addr.shippingCity,
      shippingState:          addr.shippingState,
      shippingZip:            addr.shippingZip,
      shippingCountry:        addr.shippingCountry,
    })
    .where(eq(ordersTable.id, orderId));

  logger.info({ orderId, sellerFulfillmentOrderId }, "Order auto-submitted to Amazon MCF");
  return { orderId, success: true, skipped: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Persist a fulfillment error on the order and return the result. */
async function markError(orderId: number, message: string): Promise<McfAutoFulfillResult> {
  await db
    .update(ordersTable)
    .set({ status: "fulfillment_error", fulfillmentErrorMessage: message })
    .where(eq(ordersTable.id, orderId));
  return { orderId, success: false, skipped: false, error: message };
}
