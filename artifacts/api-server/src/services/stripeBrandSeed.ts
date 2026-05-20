import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";

const BRANDS = [
  { name: "Luvs", monthlyPriceCents: 1499, biweeklyPriceCents: 849 },
  { name: "Huggies", monthlyPriceCents: 1999, biweeklyPriceCents: 1099 },
  { name: "Pampers", monthlyPriceCents: 2499, biweeklyPriceCents: 1399 },
  { name: "The Honest Company", monthlyPriceCents: 2999, biweeklyPriceCents: 1699 },
] as const;

/**
 * Ensures each diaper brand has a Stripe product + monthly/biweekly recurring
 * prices. Idempotent — safe to run on every server startup.
 */
export async function ensureBrandProductsSeeded(): Promise<void> {
  try {
    const stripe = await getUncachableStripeClient();

    for (const brand of BRANDS) {
      const existingProducts = await stripe.products.search({
        query: `metadata["dipes_brand"]:"${brand.name}"`,
      });

      let productId: string;
      if (existingProducts.data.length > 0) {
        productId = existingProducts.data[0].id;
      } else {
        const product = await stripe.products.create({
          name: `${brand.name} Diaper Subscription`,
          metadata: { dipes_brand: brand.name },
        });
        productId = product.id;
        logger.info({ brand: brand.name, productId }, "Created Stripe product for brand");
      }

      const existingPrices = await stripe.prices.list({ product: productId, active: true, limit: 20 });
      const hasMonthly = existingPrices.data.some((p) => p.metadata["frequency_days"] === "30");
      const hasBiweekly = existingPrices.data.some((p) => p.metadata["frequency_days"] === "14");

      if (!hasMonthly) {
        await stripe.prices.create({
          product: productId,
          unit_amount: brand.monthlyPriceCents,
          currency: "usd",
          recurring: { interval: "month", interval_count: 1 },
          metadata: { dipes_brand: brand.name, frequency_days: "30" },
        });
        logger.info({ brand: brand.name }, "Created monthly Stripe price");
      }

      if (!hasBiweekly) {
        await stripe.prices.create({
          product: productId,
          unit_amount: brand.biweeklyPriceCents,
          currency: "usd",
          recurring: { interval: "week", interval_count: 2 },
          metadata: { dipes_brand: brand.name, frequency_days: "14" },
        });
        logger.info({ brand: brand.name }, "Created biweekly Stripe price");
      }
    }

    logger.info("Stripe brand product seed complete");
  } catch (err) {
    logger.error({ err }, "Stripe brand product seed failed — continuing");
  }
}
