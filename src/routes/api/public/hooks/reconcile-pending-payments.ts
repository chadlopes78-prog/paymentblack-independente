import { createFileRoute } from "@tanstack/react-router";

/**
 * Reconciliation sweep for pending sales.
 *
 * Why it exists
 * -------------
 * E-Mola and M-Pesa C2B prompts can silently drop on the operator side:
 * the customer never receives the PIN prompt, confirms too late, or the
 * gateway's webhook never arrives. The sale row stays "pending" forever,
 * inflating the pending count and hiding real failure causes.
 *
 * What it does
 * ------------
 * Every run, mark sales that have been "pending" for longer than the
 * operator's reasonable confirmation window as terminal failures with a
 * clear, user-facing reason. We do NOT touch business logic, amounts,
 * webhooks, or callbacks — only the row's status and status_reason.
 *
 * Safety
 * ------
 * If a late successful webhook arrives AFTER reconciliation, the existing
 * confirmSalePayment() path still flips the sale to "paid" (it only
 * excludes status='paid'), so we never lose a real payment.
 */
export const Route = createFileRoute("/api/public/hooks/reconcile-pending-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("x-api-key") ??
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          null;
        // Canonical pg_cron auth = Supabase anon/publishable key in `apikey`.
        // CRON_SECRET kept as optional fallback for legacy callers.
        const accepted = new Set(
          [
            process.env.SUPABASE_PUBLISHABLE_KEY,
            process.env.SUPABASE_ANON_KEY,
            process.env.CRON_SECRET,
          ].filter((v): v is string => Boolean(v)),
        );
        if (!provided || !accepted.has(provided)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const olderThanMinutes = Math.max(
          2,
          Math.min(60, Number(url.searchParams.get("minutes") ?? "3")),
        );

        const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { markSaleTerminalFailure } = await import(
          "@/lib/payments/confirmation.server"
        );

        const { data: stale, error } = await supabaseAdmin
          .from("sales")
          .select("id, payment_method, created_at, status")
          .eq("status", "pending")
          .lte("created_at", cutoff)
          .limit(500);

        if (error) {
          console.error("[reconcile] fetch error", error);
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        let updated = 0;
        const errors: string[] = [];

        for (const sale of stale ?? []) {
          try {
            const method = String(sale.payment_method ?? "").toLowerCase();
            const wallet = method.includes("mpesa")
              ? "M-Pesa"
              : method.includes("emola")
                ? "E-Mola"
                : "operadora";
            // Surface the real-world cause: the operator/gateway never
            // returned a terminal status within the window. This lets the
            // user retry and gives daily-summary a clean bucket to report.
            const reason = `Sem confirmação da ${wallet} dentro de ${olderThanMinutes} min — provável timeout do PIN ou indisponibilidade do gateway.`;
            await markSaleTerminalFailure({
              saleId: sale.id,
              status: "expired",
              reason,
              method: sale.payment_method ?? null,
            });
            updated += 1;
          } catch (e) {
            const msg = (e as Error)?.message ?? String(e);
            errors.push(`${sale.id}: ${msg}`);
            console.error("[reconcile] mark failed", { saleId: sale.id, err: msg });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            scanned: stale?.length ?? 0,
            updated,
            older_than_minutes: olderThanMinutes,
            errors: errors.slice(0, 20),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
