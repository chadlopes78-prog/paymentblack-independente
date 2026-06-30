import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function triggerSaleApprovedNotification(saleId: string) {
  try {
    console.log(`[Notification] Triggering sale approved notification for sale: ${saleId}`);
    const { data: existingLog, error: existingLogError } = await supabaseAdmin
      .from("notifications_log")
      .select("id")
      .eq("type", "sale_approved")
      .contains("metadata", { saleId })
      .maybeSingle();
    if (existingLogError) {
      console.error("[Notification] Error checking notification idempotency:", existingLogError);
    }
    if (existingLog) return;

    // Fetch complete sale data including product details
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from("sales")
      .select("*, products(name)")
      .eq("id", saleId)
      .maybeSingle();

    if (fetchError || !sale) {
      console.error("[Notification] Error fetching sale for notification:", fetchError);
      return;
    }

    const products = sale.products as { name?: string | null } | null;
    const userId = sale.user_id;
    const productName = products?.name || "Produto";
    const amount = sale.amount || 0;
    const paymentMethod = (sale.payment_method || "Checkout").toUpperCase();

    if (!userId) {
      console.error("[Notification] No user_id found for sale:", saleId);
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[Notification] Supabase credentials missing in environment");
      return;
    }

    // Use the specific message requested by the user
    const title = "💰 Venda aprovada!";
    const body = `Recebeste pagamento de ${amount} MT via ${paymentMethod} no produto ${productName}`;

    console.log(`[Notification] Sending push to user ${userId}: ${body}`);

    await supabaseAdmin.from("notifications_log").insert({
      user_id: userId,
      title,
      body,
      type: "sale_approved",
      metadata: { saleId, status: "queued" },
    });

    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_id: userId,
        title,
        body,
        url: "/dashboard/sales",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Notification] Failed to send push via edge function:", errorText);

      // Save to logs even if it failed
      await supabaseAdmin.from("notifications_log").insert({
        user_id: userId,
        title,
        body,
        type: "push_error",
        metadata: { saleId, error: errorText, status: response.status },
      });
    } else {
      console.log(`[Notification] Push notification sent successfully for sale ${saleId}`);
    }
  } catch (err) {
    console.error("[Notification] Critical error in triggerSaleApprovedNotification:", err);
  }
}
