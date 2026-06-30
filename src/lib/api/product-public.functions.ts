import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PUBLIC_PRODUCT_COLUMNS =
  "id, user_id, name, description, price, image_url, checkout_banner_url, category, status, custom_url, warranty_days, delivery_type, facebook_pixel_id, bump_enabled, bump_title, bump_description, bump_price, bump_image_url, bump_button_text, bump_highlight_color";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getPublicProduct = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ productId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    // Load admin client inside handler — never at module top-level in a *.functions.ts file.
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");


    const { productId } = data;
    const isUuid = UUID_RE.test(productId);

    let product: any = null;
    const primary = await supabase
      .from("products")
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq(isUuid ? "id" : "custom_url", productId)
      .maybeSingle();

    if (primary.error) {
      console.error("Public checkout product lookup failed:", primary.error.message);
    }
    product = primary.data;

    if (!product && isUuid) {
      const fallback = await supabase
        .from("products")
        .select(PUBLIC_PRODUCT_COLUMNS)
        .eq("custom_url", productId)
        .maybeSingle();

      if (fallback.error) {
        console.error("Public checkout fallback lookup failed:", fallback.error.message);
      }
      product = fallback.data;
    }

    if (!product) {
      return { product: null, checkout: null, defaultPixel: null };
    }

    const pixelRes = product.facebook_pixel_id
      ? { data: null }
      : await supabase
          .from("pixel_configs")
          .select("fb_pixel_id")
          .eq("user_id", product.user_id)
          .maybeSingle();

    return {
      product,
      checkout: null,
      defaultPixel: pixelRes.data ?? null,
    };
  });
