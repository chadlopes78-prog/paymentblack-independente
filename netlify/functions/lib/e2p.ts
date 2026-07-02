/**
 * Shared E2Payments gateway helpers, used by both the synchronous
 * api-payment.ts entrypoint and the api-payment-confirm-background.ts
 * long-running confirmation job.
 *
 * IMPORTANT: callE2pGateway() must never be given an aggressive abort
 * timeout that can fire before E2Payments genuinely answers. Aborting our
 * side of the HTTP connection does NOT stop the telco from completing an
 * already-dispatched STK push — the customer's wallet can still be
 * debited even though we gave up listening for the result. That mismatch
 * (money moved, but our system claims "not completed") is the single
 * worst failure mode for a payment system, so this module is written to
 * make it structurally impossible: we only ever have a very generous
 * safety-net timeout here, never an aggressive one.
 */

export const E2P_BASE_URL = "https://e2payments.explicador.co.mz";

export interface GatewayLogEntry {
  direction: "oauth_token" | "payment_request";
  endpoint: string;
  httpStatus: number;
  durationMs: number;
  ok: boolean;
  error?: string;
  responseBody?: string;
}

/**
 * Fire-and-forget log sink, set once per invocation by the caller (which
 * knows how to reach Supabase — this module deliberately doesn't import
 * the Supabase client itself, to stay a pure gateway-protocol module).
 * Logging must never add latency or ever throw into the payment flow.
 */
type LogSink = (entry: GatewayLogEntry) => void;
let logSink: LogSink | null = null;
export function setGatewayLogSink(sink: LogSink | null) {
  logSink = sink;
}
function emitLog(entry: GatewayLogEntry) {
  try {
    logSink?.(entry);
  } catch (e) {
    console.error("[e2p] log sink threw", e);
  }
}

const PAID_STATUSES = new Set(["paid", "approved", "success", "completed", "complete", "confirmed"]);
const FAILED_STATUSES = new Set(["failed", "failure", "error", "cancelled", "canceled", "rejected", "refused", "declined"]);
const EXPIRED_STATUSES = new Set(["expired", "timeout", "timed_out"]);

// Reused across invocations on a warm Lambda container — saves a full
// OAuth round-trip (typically 150-400ms) on every payment after the first.
const e2pTokenCache = new Map<string, { value: string; expiresAt: number }>();

export async function getE2pAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = e2pTokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.value;
  }

  const endpoint = `${E2P_BASE_URL}/oauth/token`;
  const startedAt = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }

  emitLog({
    direction: "oauth_token",
    endpoint,
    httpStatus: res.status,
    durationMs: Date.now() - startedAt,
    ok: res.ok && !!json?.access_token,
    // Never log the token itself or the client_secret we sent.
    responseBody: json?.access_token ? "{access_token: [redacted], ...}" : text?.slice(0, 500),
  });

  if (!res.ok || !json?.access_token) {
    throw new Error(`Falha ao autenticar com E2Payments (HTTP ${res.status}).`);
  }

  const expiresInMs = (Number(json.expires_in) || 3600) * 1000;
  const token = String(json.access_token);
  e2pTokenCache.set(clientId, { value: token, expiresAt: Date.now() + expiresInMs });
  return token;
}

export async function callE2pGateway(params: {
  method: "mpesa" | "emola";
  clientId: string;
  clientSecret: string;
  walletId: string;
  amount: number;
  phone: string;
  reference: string;
  customerName: string;
  tokenPromise?: Promise<string>;
  /**
   * Safety-net timeout ONLY — must be generous. Do not lower this to make
   * the checkout "feel faster": aborting early risks the exact
   * money-debited-but-marked-failed inconsistency this module exists to
   * prevent. Real speed comes from the short-poll fast path in
   * api-payment.ts, not from cutting this connection short.
   */
  safetyNetTimeoutMs?: number;
}): Promise<{ ok: boolean; json: any; status: number; timedOut: boolean }> {
  const token = await (params.tokenPromise ?? getE2pAccessToken(params.clientId, params.clientSecret));
  const endpoint =
    params.method === "mpesa"
      ? `${E2P_BASE_URL}/v1/c2b/mpesa-payment/${params.walletId}`
      : `${E2P_BASE_URL}/v1/c2b/emola-payment/${params.walletId}`;

  const controller = new AbortController();
  const timeoutMs = params.safetyNetTimeoutMs ?? 170_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        client_id: params.clientId,
        amount: String(params.amount),
        phone: params.phone,
        reference: params.reference,
        merchant_name: params.customerName.slice(0, 60) || "PaymentBlackMZ",
        description: "Pagamento de produto digital",
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    emitLog({
      direction: "payment_request",
      endpoint,
      httpStatus: res.status,
      durationMs: Date.now() - startedAt,
      ok: res.ok,
      responseBody: text?.slice(0, 1000),
    });
    return { ok: res.ok, json, status: res.status, timedOut: false };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      emitLog({
        direction: "payment_request",
        endpoint,
        httpStatus: 0,
        durationMs: Date.now() - startedAt,
        ok: false,
        error: `timeout after ${timeoutMs}ms safety net`,
      });
      return { ok: false, json: null, status: 0, timedOut: true };
    }
    emitLog({
      direction: "payment_request",
      endpoint,
      httpStatus: 0,
      durationMs: Date.now() - startedAt,
      ok: false,
      error: e?.message || String(e),
    });
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function normalizeGatewayStatus(payload: any, httpOk: boolean): string {
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

  const message = String(
    payload.message ?? payload.error ?? data.message ?? data.error ?? transacao.message ?? ""
  ).toLowerCase();
  if (/(customer.*did.*not.*enter.*pin|pin\s+incorret|recus|reject|declin|cancel|insufficient)/i.test(`${message} ${raw}`)) {
    return "failed";
  }
  return "pending";
}

export function readTransactionId(payload: any): string | null {
  if (!payload) return null;
  const data = payload.data ?? {};
  const transacao = payload.transacao ?? {};
  const value =
    transacao.id ?? transacao.transaction_id ?? transacao.transactionId ??
    data.id ?? data.transaction_id ?? data.transactionId ??
    payload.transaction_id ?? payload.transactionId ?? payload.id ?? null;
  return value == null ? null : String(value);
}

export function buildProductAccessPayload(p: any) {
  return {
    access_link: p.access_link ?? null,
    delivery_link: p.delivery_link ?? null,
    support_phone: p.support_phone ?? null,
    support_number: p.support_number ?? null,
    thank_you_button_text: p.thank_you_button_text ?? null,
    thank_you_url: p.thank_you_url ?? null,
  };
}
