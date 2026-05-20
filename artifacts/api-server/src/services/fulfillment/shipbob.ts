import type {
  IFulfillmentProvider,
  FulfillmentOrderInput,
  FulfillmentOrderStatus,
} from "./types";

const SHIPBOB_BASE = "https://api.shipbob.com/1_0";

function token() {
  const t = process.env.SHIPBOB_TOKEN;
  if (!t) throw new Error("SHIPBOB_TOKEN environment variable is not set");
  return t;
}

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    "Content-Type": "application/json",
  };
}

// ── Raw ShipBob types ──────────────────────────────────────────────────────────

export interface ShipBobRecipient {
  name: string;
  email?: string;
  address: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    country: string;
    zip_code: string;
  };
}

export interface ShipBobOrderProduct {
  id: number;
  quantity: number;
}

export interface CreateShipBobOrderParams {
  referenceId: string;
  orderNumber: string;
  recipient: ShipBobRecipient;
  products: ShipBobOrderProduct[];
  shippingMethod?: string;
}

export interface ShipBobOrderResponse {
  id: number;
  reference_id: string;
  order_number: string;
  status: string;
  tracking?: {
    tracking_number?: string;
    carrier?: string;
  };
}

// ── Raw API functions ──────────────────────────────────────────────────────────

export async function createFulfillmentOrder(params: CreateShipBobOrderParams): Promise<ShipBobOrderResponse> {
  const body = {
    reference_id: params.referenceId,
    order_number: params.orderNumber,
    shipping_method: params.shippingMethod ?? "Standard",
    recipient: params.recipient,
    products: params.products,
  };

  const res = await fetch(`${SHIPBOB_BASE}/order`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ShipBob createOrder failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<ShipBobOrderResponse>;
}

export async function getFulfillmentOrder(shipbobOrderId: number): Promise<ShipBobOrderResponse> {
  const res = await fetch(`${SHIPBOB_BASE}/order/${shipbobOrderId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ShipBob getOrder failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<ShipBobOrderResponse>;
}

export async function listInventory() {
  const res = await fetch(`${SHIPBOB_BASE}/inventory`, { headers: headers() });
  if (!res.ok) throw new Error(`ShipBob listInventory failed (${res.status})`);
  return res.json();
}

export function mapShipBobStatus(shipbobStatus: string): string {
  const s = shipbobStatus?.toLowerCase() ?? "";
  if (s === "completed" || s === "fulfilled") return "delivered";
  if (s.includes("processing") || s.includes("picked") || s.includes("packed")) return "processing";
  if (s.includes("shipped") || s.includes("transit")) return "shipped";
  if (s === "exception" || s === "cancelled") return "exception";
  return "pending";
}

// ── IFulfillmentProvider implementation ───────────────────────────────────────

export class ShipBobFulfillmentProvider implements IFulfillmentProvider {
  readonly name = "shipbob" as const;

  async createOrder(input: FulfillmentOrderInput): Promise<void> {
    await createFulfillmentOrder({
      referenceId: input.fulfillmentOrderId,
      orderNumber: input.displayableOrderId,
      shippingMethod: input.shippingSpeedCategory ?? "Standard",
      recipient: {
        name: input.destinationAddress.name,
        address: {
          address1: input.destinationAddress.addressLine1,
          address2: input.destinationAddress.addressLine2,
          city: input.destinationAddress.city,
          state: input.destinationAddress.stateOrRegion,
          country: input.destinationAddress.countryCode,
          zip_code: input.destinationAddress.postalCode,
        },
      },
      products: input.items.map((item) => ({
        id: Number(item.sku),
        quantity: item.quantity,
      })),
    });
  }

  async getOrderStatus(fulfillmentId: string): Promise<FulfillmentOrderStatus> {
    const order = await getFulfillmentOrder(Number(fulfillmentId));
    return {
      status: order.status,
      trackingNumber: order.tracking?.tracking_number ?? null,
      carrier: order.tracking?.carrier ?? null,
    };
  }

  mapStatus(providerStatus: string): string {
    return mapShipBobStatus(providerStatus);
  }
}
