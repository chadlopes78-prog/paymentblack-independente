import { createFileRoute } from "@tanstack/react-router";

// Chamado por pg_cron a cada minuto. Processa um lote de deliveries pendentes.
export const Route = createFileRoute("/api/public/hooks/process-webhook-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("apikey") ??
          request.headers.get("x-api-key") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          null;
        const expected = process.env.CRON_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deliverOnce } = await import("@/lib/webhooks/dispatcher.server");

        await supabaseAdmin
          .from("webhook_deliveries")
          .update({ status: "pending" })
          .eq("status", "processing")
          .lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString());

        const { data, error } = await supabaseAdmin
          .from("webhook_deliveries")
          .select("id")
          .eq("status", "pending")
          .lte("next_attempt_at", new Date().toISOString())
          .order("next_attempt_at", { ascending: true })
          .limit(50);

        if (error) {
          console.error("[webhook-queue] list error", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const ids = (data ?? []).map((d) => d.id);
        await Promise.all(
          ids.map((id) =>
            deliverOnce(id).catch((e) => console.error("[webhook-queue] deliver err", e)),
          ),
        );

        return Response.json({ ok: true, processed: ids.length });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to process" }),
    },
  },
});
