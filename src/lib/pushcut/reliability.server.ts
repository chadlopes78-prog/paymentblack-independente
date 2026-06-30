import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SendPushcutOnceOptions = {
  orderId: string;
  userId: string | null;
  webhookId: string | null;
  url: string;
  eventType?: string;
  paymentStatus?: string;
  source: string;
  amount?: number | string | null;
};

const GATEWAY_FEE_PERCENT = 0.15;
const GATEWAY_FEE_FIXED = 15;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function computeNetAmount(gross: unknown): number {
  const g = toNumber(gross);
  if (g <= 0) return 0;
  const net = g - g * GATEWAY_FEE_PERCENT - GATEWAY_FEE_FIXED;
  return Math.max(0, Math.round(net * 100) / 100);
}

export function readPushcutOrderId(payload: Record<string, unknown>): string | null {
  const value = payload.orderId ?? payload.order_id ?? payload.sale_id ?? payload.saleId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isPaidStatusForPushcut(value: unknown) {
  return String(value ?? "").toLowerCase().trim() === "paid";
}

export async function sendPushcutOnce({
  orderId,
  userId,
  webhookId,
  url,
  eventType = "sale.approved",
  paymentStatus = "paid",
  source,
  amount,
}: SendPushcutOnceOptions): Promise<{ sent: boolean; duplicate: boolean; blocked: boolean }> {
  const allowed = eventType === "sale.approved" && isPaidStatusForPushcut(paymentStatus);
  const grossAmount = toNumber(amount);
  const netAmount = computeNetAmount(amount);

  console.log("[pushcut] trigger attempt", {
    orderId,
    eventType,
    paymentStatus,
    allowed,
    duplicate: false,
    source,
  });

  if (!allowed) {
    console.log("[pushcut] blocked: invalid event/status", { orderId, eventType, paymentStatus, source });
    return { sent: false, duplicate: false, blocked: true };
  }

  const { data: existingLog, error: checkError } = await supabaseAdmin
    .from("pushcut_logs")
    .select("id, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (checkError) {
    console.error("[pushcut] duplicate check failed", { orderId, error: checkError });
    return { sent: false, duplicate: false, blocked: true };
  }

  if (existingLog) {
    console.log("[pushcut] blocked: duplicate", {
      orderId,
      eventType,
      paymentStatus,
      allowed,
      duplicate: true,
      status: existingLog.status,
      source,
    });
    return { sent: false, duplicate: true, blocked: true };
  }

  const { data: lock, error: lockError } = await supabaseAdmin
    .from("pushcut_logs")
    .insert({
      order_id: orderId,
      user_id: userId,
      webhook_id: webhookId,
      status: "processing",
      metadata: {
        source,
        eventType,
        payment_status: paymentStatus,
        locked_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (lockError) {
    if (lockError.code === "23505") {
      console.log("[pushcut] blocked: duplicate lock", {
        orderId,
        eventType,
        paymentStatus,
        allowed,
        duplicate: true,
        source,
      });
      return { sent: false, duplicate: true, blocked: true };
    }
    console.error("[pushcut] lock failed", { orderId, error: lockError });
    return { sent: false, duplicate: false, blocked: true };
  }

  let responseCode: number | null = null;
  let responseBody = "";
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "sale_approved",
        orderId,
        value: netAmount,
        amount: netAmount,
        gross_amount: grossAmount,
        net_amount: netAmount,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    responseCode = response.status;
    responseBody = (await response.text().catch(() => "")).slice(0, 2000);
    if (!response.ok) errorMessage = `HTTP ${response.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (!errorMessage && responseCode !== null && responseCode >= 200 && responseCode < 300) {
    await supabaseAdmin
      .from("pushcut_logs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        metadata: {
          source,
          eventType,
          payment_status: paymentStatus,
          response_code: responseCode,
          response_body: responseBody,
        },
      })
      .eq("id", lock.id);
    console.log("[pushcut] sent", { orderId, responseCode, source });
    return { sent: true, duplicate: false, blocked: false };
  }

  await supabaseAdmin
    .from("pushcut_logs")
    .update({
      status: "failed",
      metadata: {
        source,
        eventType,
        payment_status: paymentStatus,
        response_code: responseCode,
        response_body: responseBody,
        error: errorMessage,
      },
    })
    .eq("id", lock.id);
  console.error("[pushcut] send failed", { orderId, responseCode, error: errorMessage, source });
  return { sent: false, duplicate: false, blocked: true };
}