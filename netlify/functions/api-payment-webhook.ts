import { ensureWebSocket } from "./lib/ws-polyfill";
import { createClient } from "@supabase/supabase-js";

ensureWebSocket();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const PAID_STATUSES = new Set(["paid", "approved", "success", "completed", "complete", "confirmed"]);
const FAILED_STATUSES = new Set(["failed", "failure", "error", "cancelled", "canceled", "rejected", "refused", "declined"]);
const EXPIRED_STATUSES = new Set(["expired", "timeout", "timed_out"]);

function normalizeGatewayStatus(payload: any, httpOk: boolean): string {
  if (!payload) return "pending";
  const data = payload.data ?? {};
  const transacao = payload.transacao ?? {};
  const hasTransacaoKeys = Object.keys(transacao).length > 0;
  const raw = String(
    transacao.status ?? transacao.payment_status ?? transacao.state ??
    data.status ?? data.payment_status ?? data.state ??
    (!hasTransacaoKeys ? payload.status : null) ?? ""
  ).toLowerCase().trim();

  if (PAID_STATUSES.has(raw)) return "paid";
  if (EXPIRED_STATUSES.has(raw)) return "expired";
  if (FAILED_STATUSES.has(raw)) return "failed";

  const message = String(payload.message ?? payload.error ?? data.message ?? data.error ?? transacao.message ?? "").toLowerCase();
  if (/(customer.*did.*not.*enter.*pin|pin\s+incorret|recus|reject|declin|cancel|insufficient)/i.test(`${message} ${raw}`)) {
    return "failed";
  }
  return "pending";
}

function readTransactionId(payload: any): string | null {
  if (!payload) return null;
  const data = payload.data ?? {};
  const transacao = payload.transacao ?? {};
  const value =
    transacao.id ?? transacao.transaction_id ?? transacao.transactionId ??
    data.id ?? data.transaction_id ?? data.transactionId ??
    payload.transaction_id ?? payload.transactionId ?? payload.id ?? null;
  return value == null ? null : String(value);
}

function readReference(payload: any): string | null {
  if (!payload) return null;
  const data = payload.data ?? {};
  const transacao = payload.transacao ?? {};
  const value =
    transacao.reference ?? transacao.transaction_reference ?? transacao.external_reference ??
    data.reference ?? data.transaction_reference ?? data.external_reference ??
    payload.reference ?? payload.transaction_reference ?? payload.external_reference ?? null;
  return value == null ? null : String(value);
}

export const handler = async (event: any) => {
  try {
    return await handleRequest(event);
  } catch (e: any) {
    console.error("api-payment-webhook unhandled error", e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Erro no servidor: " + (e?.message || String(e)) }) };
  }
};

async function handleRequest(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Servidor não configurado." }) };
  }

  let payload: any;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "JSON inválido." }) };
  }

  const reference = readReference(payload);
  const transactionId = readTransactionId(payload);
  const gatewayStatus = normalizeGatewayStatus(payload, true);

  if (!reference) {
    console.warn("[webhook] no reference in payload", JSON.stringify(payload).slice(0, 500));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ received: true }) };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sale } = await supabase
    .from("sales")
    .select("id, status, user_id")
    .eq("payment_reference", reference)
    .maybeSingle();

  if (!sale) {
    console.warn("[webhook] no sale found for reference", reference);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ received: true }) };
  }

  const saleRow = sale as any;
  const currentStatus = String(saleRow.status ?? "").toLowerCase();

  // Don't downgrade a terminal status
  if (["paid", "failed", "expired"].includes(currentStatus)) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ received: true, skipped: true }) };
  }

  if (gatewayStatus === "paid") {
    await supabase
      .from("sales")
      .update({
        status: "paid",
        transaction_id: transactionId ? String(transactionId).slice(0, 200) : null,
      })
      .eq("id", saleRow.id);
  } else if (gatewayStatus === "failed" || gatewayStatus === "expired") {
    const errMsg = payload.message || payload.error || payload.data?.message || payload.transacao?.message
      || (gatewayStatus === "expired" ? "Pagamento expirado." : "Pagamento recusado.");
    await supabase
      .from("sales")
      .update({
        status: gatewayStatus,
        status_reason: String(errMsg).slice(0, 500),
        transaction_id: transactionId ? String(transactionId).slice(0, 200) : null,
      })
      .eq("id", saleRow.id);
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ received: true }) };
}
