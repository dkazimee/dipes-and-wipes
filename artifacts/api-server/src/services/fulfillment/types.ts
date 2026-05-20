export interface FulfillmentAddress {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrRegion: string;
  postalCode: string;
  countryCode: string;
}

export interface FulfillmentItem {
  sku: string;
  itemId: string;
  quantity: number;
}

export interface FulfillmentOrderInput {
  fulfillmentOrderId: string;
  displayableOrderId: string;
  displayableOrderDate: string;
  shippingSpeedCategory?: string;
  destinationAddress: FulfillmentAddress;
  items: FulfillmentItem[];
}

export interface FulfillmentOrderStatus {
  status: string;
  trackingNumber?: string | null;
  carrier?: string | null;
}

export type FulfillmentProviderName = "amazon-mcf" | "shipbob";

export interface IFulfillmentProvider {
  readonly name: FulfillmentProviderName;
  createOrder(input: FulfillmentOrderInput): Promise<void>;
  getOrderStatus(fulfillmentId: string): Promise<FulfillmentOrderStatus>;
  mapStatus(providerStatus: string): string;
}
