import app from "./app";
import { logger } from "./utilities/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./services/payments/stripe-client";
import { ensureBrandProductsSeeded } from "./services/payments/stripe-brand-seed";

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe init");
    return;
  }
  try {
    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info("Stripe webhook configured");

    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe data backfill complete"))
      .catch((err) => logger.error({ err }, "Stripe backfill error"));

    // Ensure diaper brand products/prices exist in Stripe (idempotent)
    ensureBrandProductsSeeded()
      .catch((err) => logger.error({ err }, "Brand seed error — continuing"));
  } catch (err) {
    logger.error({ err }, "Failed to initialize Stripe — continuing without payments");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
