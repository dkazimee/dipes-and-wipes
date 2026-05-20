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
