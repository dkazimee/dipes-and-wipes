export type {
  FulfillmentAddress,
  FulfillmentItem,
  FulfillmentOrderInput,
  FulfillmentOrderStatus,
  FulfillmentProviderName,
  IFulfillmentProvider,
} from "./types";

import { AmazonMcfFulfillmentProvider } from "./amazon-mcf";
import { ShipBobFulfillmentProvider } from "./shipbob";
import type { IFulfillmentProvider, FulfillmentProviderName } from "./types";

export { AmazonMcfFulfillmentProvider } from "./amazon-mcf";
export { ShipBobFulfillmentProvider } from "./shipbob";

export function createFulfillmentProvider(name: FulfillmentProviderName): IFulfillmentProvider {
  if (name === "shipbob") return new ShipBobFulfillmentProvider();
  return new AmazonMcfFulfillmentProvider();
}

export function getDefaultFulfillmentProvider(): IFulfillmentProvider {
  const name = (process.env.FULFILLMENT_PROVIDER ?? "amazon-mcf") as FulfillmentProviderName;
  return createFulfillmentProvider(name);
}
