import { getUncachableStripeClient } from "./stripeClient.ts";

const BRANDS = [
  {
    name: "Luvs",
    description: "Trusted leak protection without the premium price tag. Reliable coverage for families watching their budget.",
    monthlyPriceCents: 1499,
    biweeklyPriceCents: 849,
  },
  {
    name: "Huggies",
    description: "America's most trusted diaper brand. Pocketed waistband and soft outer cover for all-day comfort.",
    monthlyPriceCents: 1999,
    biweeklyPriceCents: 1099,
  },
  {
    name: "Pampers",
    description: "The #1 hospital-recommended brand. Ultra-soft with wetness indicator so you always know it's time for a change.",
    monthlyPriceCents: 2499,
    biweeklyPriceCents: 1399,
  },
  {
    name: "The Honest Company",
    description: "Plant-based liner, no harsh chemicals, adorable prints. Eco-conscious diapers for health-minded parents.",
    monthlyPriceCents: 2999,
    biweeklyPriceCents: 1699,
  },
] as const;

async function main() {
  const stripe = await getUncachableStripeClient();
  console.log("Seeding diaper brand products to Stripe...\n");

  for (const brand of BRANDS) {
    console.log(`→ ${brand.name}`);

    const existingProducts = await stripe.products.search({
      query: `metadata["dipes_brand"]:"${brand.name}"`,
    });

    let productId: string;

    if (existingProducts.data.length > 0) {
      productId = existingProducts.data[0].id;
      console.log(`  Product already exists: ${productId}`);
    } else {
      const product = await stripe.products.create({
        name: `${brand.name} Diaper Subscription`,
        description: brand.description,
        metadata: { dipes_brand: brand.name },
      });
      productId = product.id;
      console.log(`  Created product: ${productId}`);
    }

    const existingPrices = await stripe.prices.list({ product: productId, active: true, limit: 20 });

    const hasMonthly = existingPrices.data.some(
      (p) => p.metadata["frequency_days"] === "30"
    );
    const hasBiweekly = existingPrices.data.some(
      (p) => p.metadata["frequency_days"] === "14"
    );

    if (!hasMonthly) {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: brand.monthlyPriceCents,
        currency: "usd",
        recurring: { interval: "month", interval_count: 1 },
        metadata: { dipes_brand: brand.name, frequency_days: "30" },
      });
      console.log(`  Created monthly price: ${price.id} ($${(brand.monthlyPriceCents / 100).toFixed(2)}/mo)`);
    } else {
      console.log(`  Monthly price already exists`);
    }

    if (!hasBiweekly) {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: brand.biweeklyPriceCents,
        currency: "usd",
        recurring: { interval: "week", interval_count: 2 },
        metadata: { dipes_brand: brand.name, frequency_days: "14" },
      });
      console.log(`  Created biweekly price: ${price.id} ($${(brand.biweeklyPriceCents / 100).toFixed(2)}/2wks)`);
    } else {
      console.log(`  Biweekly price already exists`);
    }
  }

  console.log("\n✅ Stripe seed complete!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
