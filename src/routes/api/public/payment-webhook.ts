import { createFileRoute } from "@tanstack/react-router";

function queryObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

async function parseGatewayPayload(request: Request) {
  const query = queryObject(request);
  if (request.method === "GET") return query;

  const bodyText = await request.text();
  if (!bodyText) return query;

  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return { ...query, ...Object.fromEntries(new URLSearchParams(bodyText).entries()) };
    }
    const parsed = JSON.parse(bodyText);
    return parsed && typeof parsed === "object" ? { ...query, ...(parsed as Record<string, unknown>) } : query;
  } catch {
    try {
      return { ...query, ...Object.fromEntries(new URLSearchParams(bodyText).entries()) };
    } catch {
      throw new Error("Invalid webhook payload");
    }
  }
}

async function handlePaymentWebhook(request: Request) {
  let payload: unknown = null;
  try {
    payload = await parseGatewayPayload(request);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Shared-secret verification is MANDATORY. If PAYMENT_WEBHOOK_SECRET is not
  // configured, refuse to process callbacks rather than accepting forged ones.
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("[payment-webhook] PAYMENT_WEBHOOK_SECRET is not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }
  {
    const url = new URL(request.url);
    const sent =
      request.headers.get("x-webhook-secret") ||
      request.headers.get("x-payment-secret") ||
      request.headers.get("x-webhook-token") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      url.searchParams.get("token") ||
      url.searchParams.get("secret") ||
      "";
    if (sent !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const {
    confirmSalePayment,
    findSaleForGatewayEvent,
    markSaleTerminalFailure,
    normalizeGatewayStatus,
    readGatewayMessage,
    readGatewayReference,
    readGatewayTransactionId,
  } = await import("@/lib/payments/confirmation.server");

  const transactionId = readGatewayTransactionId(payload);
  const reference = readGatewayReference(payload);

  if (!transactionId && !reference) {
    return new Response("Missing transaction id/reference", { status: 400 });
  }

  const status = normalizeGatewayStatus(payload, true);
  const payloadObject =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const saleData = await findSaleForGatewayEvent(transactionId, reference);
  if (!saleData) {
    console.error("Sale not found for webhook", { transactionId, reference });
    return new Response("Sale not found", { status: 404 });
  }

  if (status === "paid") {
    console.log("[Webhook] payment webhook received", {
      orderId: saleData.id,
      paymentStatus: status,
      transactionId,
      reference,
    });
    await confirmSalePayment({
      saleId: saleData.id,
      transactionId,
      reference,
      rawPayload: payload,
      triggerPushcut: true,
    });
  } else if (status === "failed" || status === "expired") {
    console.log("[Webhook] Sale failed:", saleData.id);
    await markSaleTerminalFailure({
      saleId: saleData.id,
      status,
      transactionId,
      reference,
      reason: readGatewayMessage(payload) ?? String(payloadObject.message ?? payloadObject.error ?? status),
      method: saleData.payment_method ?? null,
    });
  }

  return Response.json({ ok: true, status });
}

export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handlePaymentWebhook(request),
      POST: async ({ request }) => handlePaymentWebhook(request),
    },
  },
});
