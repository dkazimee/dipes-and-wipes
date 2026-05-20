/**
 * Subscription auto-fulfillment service.
 *
 * Orchestrates order submission through the fulfillment abstraction layer.
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
import { createFulfillmentProvider } from "../fulfillment";
import { logger } from "../../utilities/logger";

// ── Public types ──────────────────────────────────────────────────────────────

export type McfSkipCode =
  | "not_found"
  | "already_submitted"
  | "no_address"
  | "no_items";

export interface McfAutoFulfillOptions {
  shippingSpeed?: "Standard" | "Expedited" | "Priority";
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
  skipped: boolean;
  skipCode?: McfSkipCode;
  skipReason?: string;
  error?: string;
}

// ── Main function ─────────────────────────────────────────────────────────────

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
    return {
      orderId,
      success: false,
      skipped: true,
      skipCode: "no_address",
      skipReason: "No shipping address found. Add a shipping address to the subscription or provide one here.",
    };
  }

  // ── 3. Validate items against the approved_skus whitelist ──────────────────
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
    return { orderId, success: false, skipped: true, skipCode: "no_items", skipReason: "Subscription has no items" };
  }

  const unapproved = items.filter(i => i.approvedSkuId == null);
  if (unapproved.length > 0) {
    return markError(orderId, `Products not configured for fulfillment: ${unapproved.map(i => i.productName).join(", ")}`);
  }

  const inactive = items.filter(i => !i.active);
  if (inactive.length > 0) {
    return markError(orderId, `Products no longer available: ${inactive.map(i => i.productName).join(", ")}`);
  }

  const overQty = items.filter(i => i.maxQuantityPerOrder != null && i.quantity > i.maxQuantityPerOrder);
  if (overQty.length > 0) {
    return markError(orderId, `Products exceed max quantity per order: ${overQty.map(i => `${i.productName} (max ${i.maxQuantityPerOrder})`).join(", ")}`);
  }

  // ── 4. Submit to fulfillment provider ─────────────────────────────────────
  const provider = createFulfillmentProvider("amazon-mcf");
  const fulfillmentOrderId = `dw-order-${orderId}`;

  try {
    await provider.createOrder({
      fulfillmentOrderId,
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
      items: items.map((item, idx) => ({
        sku: item.amazonSellerSku!,
        itemId: `dw-${orderId}-item-${idx + 1}`,
        quantity: item.quantity,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fulfillment API error";
    logger.error({ err, orderId }, "Auto-fulfillment API call failed");
    return markError(orderId, msg);
  }

  // ── 5. Update order on success ─────────────────────────────────────────────
  await db
    .update(ordersTable)
    .set({
      fulfillmentProvider:     provider.name,
      fulfillmentId:           fulfillmentOrderId,
      fulfillmentStatus:       "RECEIVED",
      fulfillmentErrorMessage: null,
      status:                  "processing",
      shippingName:            addr.shippingName,
      shippingAddress1:        addr.shippingAddress1,
      shippingCity:            addr.shippingCity,
      shippingState:           addr.shippingState,
      shippingZip:             addr.shippingZip,
      shippingCountry:         addr.shippingCountry,
    })
    .where(eq(ordersTable.id, orderId));

  logger.info({ orderId, fulfillmentOrderId, provider: provider.name }, "Order auto-submitted to fulfillment");
  return { orderId, success: true, skipped: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markError(orderId: number, message: string): Promise<McfAutoFulfillResult> {
  await db
    .update(ordersTable)
    .set({ status: "fulfillment_error", fulfillmentErrorMessage: message })
    .where(eq(ordersTable.id, orderId));
  return { orderId, success: false, skipped: false, error: message };
}
