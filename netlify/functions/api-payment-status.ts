import { ensureWebSocket } from "./_ws-polyfill";
import { createClient } from "@supabase/supabase-js";

ensureWebSocket();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const PAID_STATUSES = new Set(["paid", "approved", "success", "completed", "complete", "confirmed"]);

const PAYMENT_SUCCESS_SELECT =
  "id, status, status_reason, created_at, payment_method, amount, customer_phone, transaction_id, payment_reference, products(id, access_link, delivery_link, support_phone, support_number, thank_you_button_text, thank_you_url)";

export const handler = async (event: any) => {
  try {
    return await handleRequest(event);
  } catch (e: any) {
    console.error("api-payment-status unhandled error", e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Erro no servidor: " + (e?.message || String(e)) }) };
  }
};

async function handleRequest(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Servidor não configurado." }),
    };
  }

  const saleId = event.queryStringParameters?.saleId;
  if (!saleId) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "saleId é obrigatório." }),
    };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sale, error } = await supabase
    .from("sales")
    .select(PAYMENT_SUCCESS_SELECT)
    .eq("id", saleId)
    .maybeSingle();

  if (error) {
    console.error("payment-status lookup error", error);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Não foi possível consultar o estado do pagamento." }),
    };
  }

  if (!sale) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ sale: null, product: null }),
    };
  }

  const saleRow = sale as any;

  // Auto-expire pending sales older than 2 minutes
  const currentStatus = String(saleRow.status ?? "").toLowerCase();
  const pendingAgeMs = saleRow.created_at
    ? Date.now() - new Date(saleRow.created_at).getTime()
    : 0;

  if (currentStatus === "pending" && pendingAgeMs > 2 * 60_000) {
    await supabase
      .from("sales")
      .update({
        status: "expired",
        status_reason: "Pagamento não confirmado a tempo. Provável cancelamento ou PIN não inserido.",
      })
      .eq("id", saleId)
      .eq("status", "pending");

    const { data: refreshed } = await supabase
      .from("sales")
      .select(PAYMENT_SUCCESS_SELECT)
      .eq("id", saleId)
      .maybeSingle();

    const updatedSale = (refreshed as any) ?? saleRow;
    const status = String(updatedSale.status ?? "").toLowerCase();
    const isPaid = PAID_STATUSES.has(status);
    const product = updatedSale.products as any;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        sale: { status: updatedSale.status, status_reason: updatedSale.status_reason },
        product: product
          ? {
              access_link: isPaid ? product.access_link : null,
              delivery_link: isPaid ? product.delivery_link : null,
              support_phone: product.support_phone,
              support_number: product.support_number,
              thank_you_button_text: product.thank_you_button_text,
              thank_you_url: isPaid ? product.thank_you_url : null,
            }
          : null,
      }),
    };
  }

  const status = String(saleRow.status ?? "").toLowerCase();
  const isPaid = PAID_STATUSES.has(status);
  const product = saleRow.products as any;

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      sale: { status: saleRow.status, status_reason: saleRow.status_reason },
      product: product
        ? {
            access_link: isPaid ? product.access_link : null,
            delivery_link: isPaid ? product.delivery_link : null,
            support_phone: product.support_phone,
            support_number: product.support_number,
            thank_you_button_text: product.thank_you_button_text,
            thank_you_url: isPaid ? product.thank_you_url : null,
          }
        : null,
    }),
  };
}
