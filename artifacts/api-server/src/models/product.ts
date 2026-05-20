export interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  brand: string | null;
  price: number;
  unitPriceCents: number | null;
  imageUrl: string | null;
  description: string | null;
}

export interface ApprovedSku {
  id: number;
  internalSku: string;
  amazonSellerSku: string;
  asin: string | null;
  brand: string | null;
  title: string;
  category: string;
  diaperSize: string | null;
  babyWeightMinLbs: number | null;
  babyWeightMaxLbs: number | null;
  unitCount: number | null;
  active: boolean;
  maxQuantityPerOrder: number | null;
  imageUrl: string | null;
  price: number | null;
}
