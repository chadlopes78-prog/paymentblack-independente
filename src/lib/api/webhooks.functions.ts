import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { WEBHOOK_EVENT_IDS } from "@/lib/webhooks/events";

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().url("URL inválida").max(2000),
  secret: z.string().trim().max(200).optional().nullable(),
  events: z.array(z.string().max(64)).min(1, "Selecione pelo menos 1 evento").max(50),
  product_ids: z.array(z.string().uuid()).max(200).default([]),
  is_pushcut: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const upsertWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const events = data.events.filter((e) => (WEBHOOK_EVENT_IDS as string[]).includes(e));
    const baseRow = {
      user_id: context.userId,
      name: data.name,
      url: data.url,
      events,
      product_ids: data.product_ids ?? [],
      is_pushcut: data.is_pushcut,
      active: data.active,
    };
    const hasSecret = typeof data.secret === "string" && data.secret.length > 0;
    if (data.id) {
      // On update, only overwrite secret if user supplied a new one (UI can no longer
      // read the existing value back to pre-fill the form).
      const updateRow = hasSecret ? { ...baseRow, secret: data.secret } : baseRow;
      const { error } = await context.supabase
        .from("webhook_endpoints")
        .update(updateRow)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const insertRow = { ...baseRow, secret: hasSecret ? data.secret : null };
    const { data: ins, error } = await context.supabase
      .from("webhook_endpoints")
      .insert(insertRow)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("webhook_endpoints")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: hook, error } = await context.supabase
      .from("webhook_endpoints")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !hook) throw new Error("Webhook não encontrado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deliverOnce } = await import("@/lib/webhooks/dispatcher.server");

    const { data: ins, error: insErr } = await supabaseAdmin
      .from("webhook_deliveries")
      .insert({
        webhook_id: hook.id,
        user_id: context.userId,
        event: "sale.approved",
        payload: {
          test: true,
          sale_id: "test-" + Math.random().toString(36).slice(2, 10),
          product_name: "Produto de Teste",
          customer_name: "Cliente Teste",
          customer_phone: "258840000000",
          amount: 100,
          payment_method: "mpesa",
          status: "paid",
          payment_status: "paid",
          pushcut_source: "payment_webhook",
          created_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();
    if (insErr || !ins) throw new Error(insErr?.message || "Falha ao enfileirar teste");

    await deliverOnce(ins.id);
    return { deliveryId: ins.id };
  });
