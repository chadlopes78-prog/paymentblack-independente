import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    // Add server-only values here, e.g.:
    //   databaseUrl: process.env.DATABASE_URL,
    //   stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  };
}

export type PaymentGatewayConfig = {
  apiKey: string;
  baseUrl: string;
};

const PAYMENT_GATEWAY_KEYS = [
  "PAYMENT_API_KEY",
  "payment_api_key",
  "payflax_api_key",
  "PAYFLAX_API_KEY",
] as const;

const PAYMENT_GATEWAY_BASE_URL_KEYS = [
  "PAYMENT_API_BASE_URL",
  "payment_api_base_url",
  "payflax_base_url",
  "PAYFLAX_BASE_URL",
] as const;

function cleanConfigValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePaymentGatewayBaseUrl(value: string) {
  const baseUrl = cleanConfigValue(value) || "https://payflax.site";
  return baseUrl.replace(/\/+$/, "").replace(/\/api\/pay$/i, "");
}

function pickFirstConfigValue(
  rows: Array<{ key: string; value: string | null }>,
  keys: readonly string[],
) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const row = rows.find((item) => wanted.has(String(item.key).toLowerCase()) && cleanConfigValue(item.value));
  return cleanConfigValue(row?.value);
}

async function readPaymentGatewayConfigFromDatabase(): Promise<Partial<PaymentGatewayConfig>> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keys = [...PAYMENT_GATEWAY_KEYS, ...PAYMENT_GATEWAY_BASE_URL_KEYS];
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("key,value")
      .in("key", keys as unknown as string[]);

    if (error) {
      console.error("[payments] app_config gateway lookup failed", error.message);
      return {};
    }

    const rows = (data ?? []) as Array<{ key: string; value: string | null }>;
    return {
      apiKey: pickFirstConfigValue(rows, PAYMENT_GATEWAY_KEYS),
      baseUrl: pickFirstConfigValue(rows, PAYMENT_GATEWAY_BASE_URL_KEYS),
    };
  } catch (error) {
    console.error("[payments] app_config gateway lookup crashed", error);
    return {};
  }
}

export async function getPaymentGatewayConfig(): Promise<PaymentGatewayConfig | null> {
  const envApiKey = cleanConfigValue(process.env.PAYMENT_API_KEY);
  const envBaseUrl = cleanConfigValue(process.env.PAYMENT_API_BASE_URL);
  if (envApiKey) {
    return { apiKey: envApiKey, baseUrl: normalizePaymentGatewayBaseUrl(envBaseUrl) };
  }

  const dbConfig = await readPaymentGatewayConfigFromDatabase();
  if (dbConfig.apiKey) {
    return { apiKey: dbConfig.apiKey, baseUrl: normalizePaymentGatewayBaseUrl(dbConfig.baseUrl || "") };
  }

  return null;
}
