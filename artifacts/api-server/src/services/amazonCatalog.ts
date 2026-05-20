/**
 * Amazon SP-API Catalog Items v2022-04-01.
 * Used by admin routes to look up product info and size variants before
 * bulk-importing them into the approved_skus allowlist.
 */
import { spApiRequest } from "./amazonAuth";

const MARKETPLACE_US = "ATVPDKIKX0DER";
const INCLUDED_DATA = "attributes,images,relationships,summaries";

// ── Raw SP-API types ──────────────────────────────────────────────────────────

interface RawSummary {
  marketplaceId: string;
  brand?: string;
  itemName?: string;
}

interface RawImage {
  link: string;
  variant: string;
}

interface RawImageGroup {
  marketplaceId: string;
  images: RawImage[];
}

interface RawRelationship {
  asin: string;
  type: string;
}

interface RawRelationshipGroup {
  marketplaceId: string;
  relationships: RawRelationship[];
}

interface RawAttributes {
  unit_count?: Array<{ value: number; unit?: string; marketplaceId?: string }>;
}

interface RawCatalogItem {
  asin: string;
  summaries?: RawSummary[];
  attributes?: RawAttributes;
  images?: RawImageGroup[];
  relationships?: RawRelationshipGroup[];
}

interface CatalogSearchResponse {
  numberOfResults?: number;
  items?: RawCatalogItem[];
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface CatalogProduct {
  asin: string;
  title: string;
  brand?: string;
  imageUrl?: string;
  unitCount?: number;
}

export interface CatalogProductWithVariants extends CatalogProduct {
  variants: CatalogProduct[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseItem(item: RawCatalogItem): CatalogProduct {
  const summary = item.summaries?.find((s) => s.marketplaceId === MARKETPLACE_US)
    ?? item.summaries?.[0];
  const imageGroup = item.images?.find((g) => g.marketplaceId === MARKETPLACE_US)
    ?? item.images?.[0];
  const mainImage = imageGroup?.images?.find((i) => i.variant === "MAIN")
    ?? imageGroup?.images?.[0];
  const unitCount = item.attributes?.unit_count?.find(
    (u) => !u.marketplaceId || u.marketplaceId === MARKETPLACE_US
  )?.value;

  return {
    asin: item.asin,
    title: summary?.itemName ?? item.asin,
    brand: summary?.brand,
    imageUrl: mainImage?.link,
    unitCount,
  };
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Search the Amazon catalog by keyword or ASIN prefix.
 * Returns up to 10 matching products.
 */
export async function searchCatalog(query: string): Promise<CatalogProduct[]> {
  const qs = new URLSearchParams({
    keywords: query,
    marketplaceIds: MARKETPLACE_US,
    includedData: INCLUDED_DATA,
    pageSize: "10",
  });

  const data = await spApiRequest<CatalogSearchResponse>(
    "GET",
    `/catalog/2022-04-01/items?${qs}`,
  );

  return (data.items ?? []).map(parseItem);
}

/**
 * Look up a single ASIN and fetch all its size/count variants.
 * If the item has child relationships, each child is fetched in one batch call.
 */
export async function getCatalogItemWithVariants(
  asin: string,
): Promise<CatalogProductWithVariants> {
  const qs = new URLSearchParams({
    marketplaceIds: MARKETPLACE_US,
    includedData: INCLUDED_DATA,
  });

  const item = await spApiRequest<RawCatalogItem>(
    "GET",
    `/catalog/2022-04-01/items/${encodeURIComponent(asin)}?${qs}`,
  );

  const product = parseItem(item);

  const relGroup = item.relationships?.find((r) => r.marketplaceId === MARKETPLACE_US)
    ?? item.relationships?.[0];
  const childAsins = (relGroup?.relationships ?? [])
    .filter((r) => r.type === "VARIATION")
    .map((r) => r.asin)
    .slice(0, 20);

  if (childAsins.length === 0) {
    return { ...product, variants: [] };
  }

  const batchQs = new URLSearchParams({
    marketplaceIds: MARKETPLACE_US,
    includedData: INCLUDED_DATA,
  });
  childAsins.forEach((a) => batchQs.append("asins", a));

  const batchData = await spApiRequest<CatalogSearchResponse>(
    "GET",
    `/catalog/2022-04-01/items?${batchQs}`,
  );

  const variants = (batchData.items ?? []).map(parseItem);

  return { ...product, variants };
}
