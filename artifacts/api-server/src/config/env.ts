export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",

  // Clerk auth
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? "",
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",

  // Replit platform
  replitDomains: process.env.REPLIT_DOMAINS ?? "",
  replitConnectorsHostname: process.env.REPLIT_CONNECTORS_HOSTNAME ?? "",
  replIdentity: process.env.REPL_IDENTITY ?? "",
  webReplRenewal: process.env.WEB_REPL_RENEWAL ?? "",

  // Amazon SP-API
  amazonMarketplaceId: process.env.AMAZON_MARKETPLACE_ID ?? "ATVPDKIKX0DER",
  amazonSpApiEndpoint: process.env.AMAZON_SP_API_ENDPOINT ?? "https://sellingpartnerapi-na.amazon.com",
  amazonRefreshToken: process.env.AMAZON_REFRESH_TOKEN ?? "",
  amazonLwaClientId: process.env.AMAZON_LWA_CLIENT_ID ?? "",
  amazonLwaClientSecret: process.env.AMAZON_LWA_CLIENT_SECRET ?? "",

  // ShipBob
  shipbobToken: process.env.SHIPBOB_TOKEN ?? "",

  // Email
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Dipes & Wipes <orders@dipesandwipes.com>",

  // Fulfillment provider selection: "amazon-mcf" | "shipbob"
  fulfillmentProvider: process.env.FULFILLMENT_PROVIDER ?? "amazon-mcf",
} as const;
