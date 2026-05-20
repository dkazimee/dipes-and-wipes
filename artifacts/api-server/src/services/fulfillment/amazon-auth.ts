/**
 * Shared Amazon Login with Amazon (LWA) auth + SP-API request helper.
 * Imported by both amazon-mcf.ts and catalog/amazon.ts.
 */
import { logger } from "../../utilities/logger";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export function spApiBase(): string {
  return process.env.AMAZON_SP_API_ENDPOINT ?? "https://sellingpartnerapi-na.amazon.com";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getLwaAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.accessToken;
  }

  const refreshToken = requireEnv("AMAZON_REFRESH_TOKEN");
  const clientId = requireEnv("AMAZON_LWA_CLIENT_ID");
  const clientSecret = requireEnv("AMAZON_LWA_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    logger.error({ status: res.status }, "LWA token refresh failed");
    throw new Error(`LWA token refresh failed with status ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

export async function spApiRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const accessToken = await getLwaAccessToken();
  const url = `${spApiBase()}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "x-amz-access-token": accessToken,
      "Content-Type": "application/json",
      "user-agent": "DipesAndWipes/1.0 (Language=TypeScript)",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, path }, "Amazon SP-API request failed");
    throw new Error(`Amazon SP-API ${method} ${path} failed: ${res.status} — ${text}`);
  }

  return res.json() as Promise<T>;
}
