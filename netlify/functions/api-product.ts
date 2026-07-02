import { ensureWebSocket } from "./lib/ws-polyfill";
import { createClient } from "@supabase/supabase-js";

ensureWebSocket();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_COLUMNS =
  "id, user_id, name, description, price, image_url, checkout_banner_url, category, status, custom_url, warranty_days, delivery_type, facebook_pixel_id, bump_enabled, bump_title, bump_description, bump_price, bump_image_url, bump_button_text, bump_highlight_color, checkout_banner_type, checkout_banner_video_url, timer_enabled";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const handler = async (event: any) => {
  try {
    return await handleRequest(event);
  } catch (e: any) {
    console.error("api-product unhandled error", e);
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

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const productId = event.queryStringParameters?.productId;
  if (!productId) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "productId é obrigatório." }),
    };
  }

  const isUuid = UUID_RE.test(productId);
  let product: any = null;

  const { data: primary } = await supabase
    .from("products")
    .select(PUBLIC_COLUMNS)
    .eq(isUuid ? "id" : "custom_url", productId)
    .maybeSingle();
  product = primary;

  if (!product && isUuid) {
    const { data: fallback } = await supabase
      .from("products")
      .select(PUBLIC_COLUMNS)
      .eq("custom_url", productId)
      .maybeSingle();
    product = fallback;
  }

  if (!product) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ product: null, checkout: null, defaultPixel: null }),
    };
  }

  const pixelRes = product.facebook_pixel_id
    ? { data: null }
    : await supabase
        .from("pixel_configs")
        .select("fb_pixel_id")
        .eq("user_id", product.user_id)
        .maybeSingle();

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      product,
      checkout: null,
      defaultPixel: pixelRes.data ?? null,
    }),
  };
}
