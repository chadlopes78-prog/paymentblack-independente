/**
 * Tests an E2Payments connection for the authenticated user.
 *
 * POST /api-payment-test
 * Body: {} (reads credentials from user_payment_configs)
 * Authorization: Bearer <access_token>
 */

import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function ok(body: object) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(body) };
}
function fail(msg: string, status = 400) {
  return { statusCode: status, headers: CORS, body: JSON.stringify({ success: false, error: msg }) };
}

// E2Payments authentication endpoint (OAuth2 client credentials)
const E2P_TOKEN_URL = "https://api.e2payments.explicatis.com/v1/oauth/token";
const E2P_TIMEOUT_MS = 8_000;

async function testE2pCredentials(
  clientId: string,
  clientSecret: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), E2P_TIMEOUT_MS);

    const res = await fetch(E2P_TOKEN_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }).finally(() => clearTimeout(timer));

    if (res.ok) return { ok: true };

    let msg = `HTTP ${res.status}`;
    try {
      const body: any = await res.json();
      if (body?.error_description) msg = String(body.error_description);
      else if (body?.message) msg = String(body.message);
      else if (body?.error) msg = String(body.error);
    } catch { /* ignore */ }

    return { ok: false, error: msg };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "Tempo limite excedido (8s)" };
    return { ok: false, error: e?.message || "Erro de conexão" };
  }
}

export const handler = async (event: any) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") return fail("Method not allowed", 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  if (!supabaseUrl || !serviceKey) return fail("Servidor não configurado.", 500);

  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return fail("Não autenticado.", 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return fail("Token inválido.", 401);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cfg } = await db
    .from("user_payment_configs")
    .select("e2p_mpesa_client_id, e2p_mpesa_client_secret, e2p_emola_client_id, e2p_emola_client_secret")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cfg?.e2p_mpesa_client_id && !cfg?.e2p_emola_client_id) {
    return fail("Nenhuma credencial E2Payments configurada.");
  }

  // Test whichever credentials are provided (prefer M-Pesa, fallback e-Mola)
  const clientId     = cfg.e2p_mpesa_client_id || cfg.e2p_emola_client_id || "";
  const clientSecret = cfg.e2p_mpesa_client_secret || cfg.e2p_emola_client_secret || "";

  const result = await testE2pCredentials(clientId, clientSecret);

  const newStatus = result.ok ? "connected" : "failed";
  await db
    .from("user_payment_configs")
    .update({
      e2p_connection_status: newStatus,
      e2p_last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (!result.ok) {
    return ok({ success: false, status: "failed", error: result.error || "Credenciais inválidas ou servidor indisponível." });
  }

  return ok({ success: true, status: "connected" });
};
