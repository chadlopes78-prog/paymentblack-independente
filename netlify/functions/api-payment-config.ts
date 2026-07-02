/**
 * Handles saving / parsing per-user payment configurations.
 *
 * POST /api-payment-config
 * Body (one action per request):
 *   { action: "save_doc",   fileUrl, fileName, fileSize }
 *   { action: "remove_doc" }
 *   { action: "toggle_doc", enabled: boolean }
 *   { action: "save_e2p",   mpesa: { clientId, clientSecret, wallet }, emola: { ... } }
 *   { action: "toggle_e2p", enabled: boolean }
 *
 * All actions require the caller to pass the Supabase JWT in
 * Authorization: Bearer <access_token>
 */

import { ensureWebSocket } from "./lib/ws-polyfill";
import { createClient } from "@supabase/supabase-js";

ensureWebSocket();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function ok(body: object) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(body) };
}
function err(msg: string, status = 400) {
  return { statusCode: status, headers: CORS, body: JSON.stringify({ success: false, error: msg }) };
}

/** Attempt to extract useful credentials from a JSON config document. */
function parseDocCredentials(raw: string): Record<string, string> | null {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return null;

    const pick = (candidates: string[]) => {
      for (const k of candidates) {
        const val = obj[k] ?? obj[k.toUpperCase()] ?? obj[k.toLowerCase()];
        if (val) return String(val).trim();
      }
      return undefined;
    };

    const credentials: Record<string, string> = {};
    const apiKey = pick(["api_key", "apiKey", "API_KEY", "key", "token", "access_token"]);
    if (apiKey) credentials.api_key = apiKey;

    const baseUrl = pick(["base_url", "baseUrl", "BASE_URL", "url", "endpoint", "host"]);
    if (baseUrl) credentials.base_url = baseUrl;

    const merchantId = pick(["merchant_id", "merchantId", "MERCHANT_ID", "client_id", "clientId"]);
    if (merchantId) credentials.merchant_id = merchantId;

    const secret = pick(["client_secret", "clientSecret", "secret", "SECRET", "private_key"]);
    if (secret) credentials.client_secret = secret;

    const wallet = pick(["wallet", "wallet_number", "walletNumber", "account", "payout"]);
    if (wallet) credentials.wallet = wallet;

    return Object.keys(credentials).length > 0 ? credentials : null;
  } catch {
    return null;
  }
}

export const handler = async (event: any) => {
  try {
    return await handleRequest(event);
  } catch (e: any) {
    console.error("api-payment-config unhandled error", e);
    return err("Erro no servidor: " + (e?.message || String(e)), 500);
  }
};

async function handleRequest(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") return err("Method not allowed", 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return err("Servidor não configurado.", 500);

  // Authenticate caller via JWT
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return err("Não autenticado.", 401);

  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!anonKey) {
    return err(
      "Servidor não configurado: falta a variável de ambiente SUPABASE_PUBLISHABLE_KEY no Netlify.",
      500,
    );
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return err("Token inválido.", 401);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: any;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return err("JSON inválido."); }

  const { action } = body;

  // ── Helper: upsert config row ──────────────────────────────────────────────
  async function upsertConfig(patch: Record<string, unknown>) {
    const { error } = await db
      .from("user_payment_configs")
      .upsert({ ...patch, user_id: user!.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return error;
  }

  // ── save_doc ───────────────────────────────────────────────────────────────
  if (action === "save_doc") {
    const { fileUrl, fileName, fileSize, fileContent } = body;
    if (!fileUrl) return err("fileUrl obrigatório.");

    let credentials: Record<string, string> | null = null;
    if (fileContent) credentials = parseDocCredentials(fileContent);

    const e = await upsertConfig({
      doc_file_url:   fileUrl,
      doc_file_name:  fileName || null,
      doc_file_size:  fileSize || null,
      doc_parsed_at:  credentials ? new Date().toISOString() : null,
      doc_credentials: credentials,
    });
    if (e) return err("Erro ao salvar: " + e.message, 500);
    return ok({ success: true, parsed: !!credentials, credentials });
  }

  // ── remove_doc ─────────────────────────────────────────────────────────────
  if (action === "remove_doc") {
    const e = await upsertConfig({
      doc_file_url: null, doc_file_name: null, doc_file_size: null,
      doc_parsed_at: null, doc_credentials: null, doc_enabled: false,
    });
    if (e) return err("Erro ao remover: " + e.message, 500);
    return ok({ success: true });
  }

  // ── toggle_doc ─────────────────────────────────────────────────────────────
  if (action === "toggle_doc") {
    const enabled = !!body.enabled;

    // Verify there is a doc before enabling
    if (enabled) {
      const { data: cfg } = await db
        .from("user_payment_configs")
        .select("doc_file_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cfg?.doc_file_url) return err("Nenhum documento enviado. Envie um documento primeiro.");
    }

    const e = await upsertConfig({ doc_enabled: enabled });
    if (e) return err("Erro: " + e.message, 500);
    return ok({ success: true, doc_enabled: enabled });
  }

  // ── save_e2p ───────────────────────────────────────────────────────────────
  if (action === "save_e2p") {
    const { mpesa, emola } = body;
    const e = await upsertConfig({
      e2p_mpesa_client_id:     mpesa?.clientId     || null,
      e2p_mpesa_client_secret: mpesa?.clientSecret || null,
      e2p_mpesa_wallet:        mpesa?.wallet       || null,
      e2p_emola_client_id:     emola?.clientId     || null,
      e2p_emola_client_secret: emola?.clientSecret || null,
      e2p_emola_wallet:        emola?.wallet       || null,
      e2p_connection_status:   "untested",
      e2p_last_tested_at:      null,
    });
    if (e) return err("Erro ao salvar: " + e.message, 500);
    return ok({ success: true });
  }

  // ── toggle_e2p ─────────────────────────────────────────────────────────────
  if (action === "toggle_e2p") {
    const enabled = !!body.enabled;

    if (enabled) {
      const { data: cfg } = await db
        .from("user_payment_configs")
        .select("e2p_mpesa_client_id, e2p_emola_client_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cfg?.e2p_mpesa_client_id && !cfg?.e2p_emola_client_id) {
        return err("Configure as credenciais antes de ativar.");
      }
    }

    const e = await upsertConfig({ e2p_enabled: enabled });
    if (e) return err("Erro: " + e.message, 500);
    return ok({ success: true, e2p_enabled: enabled });
  }

  return err("Ação inválida.");
}
