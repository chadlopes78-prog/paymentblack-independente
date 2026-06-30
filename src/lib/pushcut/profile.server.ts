import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ProfilePushcut = {
  pushcut_url: string | null;
  pushcut_enabled: boolean | null;
  pushcut_template: string | null;
};

type SaleInfo = {
  id: string;
  user_id: string | null;
  amount: number | string | null;
  product_id: string | null;
};

function buildPayload(
  template: string,
  data: { amount: number; productName: string; orderId: string },
) {
  if (template === "marketing") {
    return {
      title: "🔥 Nova venda confirmada!",
      text: `Você recebeu ${data.amount} MT 🚀\nProduto: ${data.productName}\nID: ${data.orderId}`,
    };
  }
  return {
    title: "Venda Realizada ✅",
    text: `Valor: ${data.amount} MT\nProduto: ${data.productName}\nTicket: #${data.orderId}`,
  };
}

/**
 * Fire-and-forget per-user Pushcut notification triggered from sale approval.
 * NEVER throws — failures are logged to `pushcut_logs` only. Add-on layer:
 * a Pushcut error MUST NOT impact the checkout / payment flow.
 */
export async function sendProfilePushcut(sale: SaleInfo): Promise<void> {
  try {
    const userId = sale.user_id;
    if (!userId) return;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("pushcut_url, pushcut_enabled, pushcut_template")
      .eq("id", userId)
      .maybeSingle<ProfilePushcut>();

    if (!profile?.pushcut_url || profile.pushcut_enabled === false) return;
    const url = profile.pushcut_url.trim();
    if (!/^https?:\/\//i.test(url)) return;

    // Idempotency: only one profile-pushcut per sale.
    const dedupeOrderId = `profile:${sale.id}`;
    const { data: existing } = await supabaseAdmin
      .from("pushcut_logs")
      .select("id")
      .eq("order_id", dedupeOrderId)
      .maybeSingle();
    if (existing) return;

    let productName = "Produto";
    if (sale.product_id) {
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("name")
        .eq("id", sale.product_id)
        .maybeSingle();
      if (prod?.name) productName = prod.name;
    }

    const amount = Number(sale.amount ?? 0);
    const payload = buildPayload(profile.pushcut_template ?? "simple", {
      amount,
      productName,
      orderId: sale.id,
    });

    let status: "success" | "failed" = "failed";
    let responseCode: number | null = null;
    let responseBody = "";
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      responseCode = res.status;
      responseBody = (await res.text().catch(() => "")).slice(0, 1000);
      if (res.ok) status = "success";
      else errorMessage = `HTTP ${res.status}`;
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    await supabaseAdmin.from("pushcut_logs").insert({
      order_id: dedupeOrderId,
      user_id: userId,
      webhook_id: null,
      status: status === "success" ? "sent" : "failed",
      sent_at: status === "success" ? new Date().toISOString() : null,
      metadata: {
        source: "profile_pushcut",
        template: profile.pushcut_template ?? "simple",
        response_code: responseCode,
        response_body: responseBody,
        error: errorMessage,
      },
    });
  } catch (err) {
    console.error("[pushcut][profile] unexpected error (suppressed)", err);
  }
}
