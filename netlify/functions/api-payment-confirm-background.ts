/**
 * Netlify BACKGROUND function (note the "-background" suffix — Netlify
 * treats this specially: it ACKs with 202 immediately on invocation and
 * lets the handler keep running for up to 15 minutes, completely decoupled
 * from the client's original request).
 *
 * This is where the actual E2Payments confirmation wait happens for the
 * synchronous /api-payment endpoint. api-payment.ts fires this function
 * and does NOT wait for it to finish — it only does a short bounded poll
 * of the `sales` row to answer the client fast when possible. This
 * function is the one and only place allowed to mark an E2Payments sale
 * "paid" or "failed": it never aborts its connection to the gateway early,
 * so there is no scenario where the customer's wallet gets charged but we
 * still report the sale as failed due to us giving up on the connection.
 */
import { ensureWebSocket } from "./lib/ws-polyfill";
import { createClient } from "@supabase/supabase-js";
import {
  callE2pGateway,
  getE2pAccessToken,
  normalizeGatewayStatus,
  readTransactionId,
  setGatewayLogSink,
  type GatewayLogEntry,
} from "./lib/e2p";

ensureWebSocket();

export const handler = async (event: any) => {
  try {
    await run(event);
  } catch (e) {
    console.error("[payment-confirm-background] unhandled error", e);
  }
  // Background functions ignore the return value, but Netlify still wants
  // *a* response shape to close out the invocation log cleanly.
  return { statusCode: 200, body: "" };
};

async function run(event: any) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[payment-confirm-background] missing Supabase env vars");
    return;
  }

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    console.error("[payment-confirm-background] invalid JSON body");
    return;
  }

  const {
    saleId,
    method,
    clientId,
    clientSecret,
    walletId,
    amount,
    phone,
    reference,
    customerName,
  } = body;

  if (!saleId || !method || !clientId || !clientSecret || !walletId || !amount || !phone || !reference) {
    console.error("[payment-confirm-background] missing required fields", { saleId });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  setGatewayLogSink((entry: GatewayLogEntry) => {
    // Fire-and-forget: never let logging slow down or break confirmation.
    supabase
      .from("payment_gateway_logs")
      .insert({
        sale_id: saleId,
        gateway: "e2payments",
        direction: entry.direction,
        endpoint: entry.endpoint,
        http_status: entry.httpStatus,
        duration_ms: entry.durationMs,
        ok: entry.ok,
        error: entry.error ?? null,
        response_body: entry.responseBody ?? null,
      })
      .then(({ error }) => {
        if (error) console.error("[payment-confirm-background] failed to write gateway log", error);
      });
  });

  // Only proceed if the sale is still pending — guards against duplicate
  // background invocations racing each other.
  const { data: existing } = await supabase
    .from("sales")
    .select("id, status")
    .eq("id", saleId)
    .maybeSingle();
  if (!existing || existing.status !== "pending") {
    return;
  }

  let gwJson: any = null;
  let ok = false;
  let timedOut = false;
  try {
    const result = await callE2pGateway({
      method: method as "mpesa" | "emola",
      clientId,
      clientSecret,
      walletId,
      amount: Number(amount),
      phone,
      reference,
      customerName,
      // Generous — background functions can run up to 15 minutes. We stop
      // well short of that so the invocation always closes out cleanly,
      // but far beyond any realistic STK-push confirmation window.
      safetyNetTimeoutMs: 12 * 60_000,
    });
    ok = result.ok;
    gwJson = result.json;
    timedOut = result.timedOut;
  } catch (e) {
    console.error("[payment-confirm-background] gateway call failed", { saleId, error: e });
    // Genuine network/auth error talking to E2Payments — we still don't
    // know if money moved, so leave the sale pending rather than guessing.
    return;
  }

  if (timedOut) {
    // Even our generous 12-minute safety net expired without an answer.
    // This should be exceptionally rare. We do NOT mark the sale failed —
    // we simply leave it pending and log loudly so it can be reconciled
    // manually if it ever happens.
    console.error("[payment-confirm-background] E2Payments never answered within safety net", { saleId, reference });
    return;
  }

  const gwStatus = normalizeGatewayStatus(gwJson, ok);
  const transactionId = readTransactionId(gwJson);

  if (gwStatus === "paid") {
    await supabase
      .from("sales")
      .update({ status: "paid", transaction_id: transactionId ? String(transactionId) : null })
      .eq("id", saleId)
      .eq("status", "pending");
  } else if (gwStatus === "failed" || gwStatus === "expired") {
    const errMsg = gwJson?.message || gwJson?.error || gwJson?.data?.message || gwJson?.transacao?.message
      || (gwStatus === "expired" ? "Pagamento expirado." : "Pagamento recusado pelo gateway.");
    await supabase
      .from("sales")
      .update({ status: gwStatus, status_reason: String(errMsg).slice(0, 500) })
      .eq("id", saleId)
      .eq("status", "pending");
  }
  // Any other normalized status ("pending") — genuinely still processing
  // on the gateway's side (shouldn't really happen since E2Payments
  // responds synchronously, but if it does, leave the sale as-is).
}
