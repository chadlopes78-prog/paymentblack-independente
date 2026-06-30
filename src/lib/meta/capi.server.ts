// Meta Conversions API (CAPI) — server-side Purchase dispatcher.
//
// Goals:
// - Send EXACTLY ONE Purchase per confirmed sale (called from
//   `dispatchApprovedSideEffects`, which only runs on the pending→paid
//   transition thanks to `.neq("status","paid")` in confirmSalePayment).
// - Deduplicate with the browser pixel via `event_id = sale.id`. Meta
//   matches event_id between Pixel (browser) and CAPI (server) within a
//   48h window and counts it as ONE event.
// - Single retry on network/5xx failures. Never throws — payment flow
//   must not be impacted by Meta CAPI issues.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CAPI_VERSION = "v21.0";

type PurchaseInput = {
  saleId: string;
  userId: string | null;
  productId: string | null;
  amount: number | string | null;
  customerPhone: string | null;
  customerName: string | null;
};

type ResolvedCreds = {
  pixelId: string;
  accessToken: string;
} | null;

async function resolveCreds(productId: string | null, userId: string | null): Promise<ResolvedCreds> {
  // Per-product credentials take precedence over per-user defaults.
  if (productId) {
    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("facebook_pixel_id, facebook_access_token")
      .eq("id", productId)
      .maybeSingle();
    if (prod?.facebook_pixel_id && prod?.facebook_access_token) {
      return { pixelId: String(prod.facebook_pixel_id), accessToken: String(prod.facebook_access_token) };
    }
  }
  if (userId) {
    const { data: cfg } = await supabaseAdmin
      .from("pixel_configs")
      .select("fb_pixel_id, fb_access_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (cfg?.fb_pixel_id && cfg?.fb_access_token) {
      return { pixelId: String(cfg.fb_pixel_id), accessToken: String(cfg.fb_access_token) };
    }
  }
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePhoneE164Digits(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  // Meta expects digits only, country code included, no leading "+".
  if (d.startsWith("258")) return d;
  if (d.length === 9) return `258${d}`;
  return d;
}

async function postOnce(url: string, body: string, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text: text.slice(0, 2000) };
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire CAPI Purchase for a confirmed sale. Fire-and-forget; never throws.
 * Idempotent at the Meta side via `event_id = saleId`.
 * Single retry on network error or 5xx (waits 1500ms).
 */
export async function sendMetaPurchaseCapi(input: PurchaseInput): Promise<void> {
  try {
    const creds = await resolveCreds(input.productId, input.userId);
    if (!creds) {
      console.info("[meta-capi] skipped: no pixel/token configured", { saleId: input.saleId });
      return;
    }

    const amount = Number(input.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.info("[meta-capi] skipped: invalid amount", { saleId: input.saleId, amount });
      return;
    }

    const phoneDigits = normalizePhoneE164Digits(input.customerPhone);
    const userData: Record<string, unknown> = {};
    if (phoneDigits) userData.ph = [await sha256Hex(phoneDigits)];
    if (input.customerName) {
      const trimmed = input.customerName.trim().split(/\s+/);
      if (trimmed[0]) userData.fn = [await sha256Hex(trimmed[0])];
      if (trimmed.length > 1) userData.ln = [await sha256Hex(trimmed.slice(1).join(" "))];
    }

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.saleId, // Dedupes against browser fbq Purchase.
          action_source: "website",
          user_data: userData,
          custom_data: {
            currency: "MZN",
            value: amount,
            content_ids: input.productId ? [input.productId] : undefined,
            content_type: "product",
          },
        },
      ],
    };

    const url = `https://graph.facebook.com/${CAPI_VERSION}/${encodeURIComponent(creds.pixelId)}/events?access_token=${encodeURIComponent(creds.accessToken)}`;
    const body = JSON.stringify(payload);

    let result = await postOnce(url, body, 8_000);
    // Retry once on transient failures only (network error / 5xx). Never retry
    // on 4xx — Meta returns deterministic config errors there.
    if (!result.ok && (result.status === 0 || result.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500));
      result = await postOnce(url, body, 8_000);
    }

    if (result.ok) {
      console.info("[meta-capi] Purchase sent", { saleId: input.saleId, pixelId: creds.pixelId, status: result.status });
    } else {
      console.error("[meta-capi] Purchase failed", {
        saleId: input.saleId,
        pixelId: creds.pixelId,
        status: result.status,
        body: result.text,
      });
    }
  } catch (err) {
    console.error("[meta-capi] unexpected error (suppressed)", err);
  }
}
