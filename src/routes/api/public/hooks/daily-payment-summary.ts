import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/daily-payment-summary")({
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

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Find all users with failures in the last 24h
        const { data: failedSales, error: salesErr } = await supabaseAdmin
          .from("sales")
          .select("user_id, payment_method, status_reason, amount, status")
          .gte("created_at", since)
          .in("status", ["failed", "error", "cancelled", "canceled"]);

        if (salesErr) {
          console.error("[daily-summary] fetch failed", salesErr);
          return new Response(JSON.stringify({ error: salesErr.message }), { status: 500 });
        }

        const grouped = new Map<string, Map<string, { count: number; total: number; method: string }>>();
        for (const s of failedSales ?? []) {
          if (!s.user_id) continue;
          const method = s.payment_method?.toLowerCase().includes("mpesa")
            ? "M-Pesa"
            : s.payment_method?.toLowerCase().includes("emola")
            ? "e-Mola"
            : s.payment_method ?? "Desconhecido";
          const reason = (s.status_reason?.trim() || "Sem motivo informado");
          const key = `${method}|${reason}`;
          if (!grouped.has(s.user_id)) grouped.set(s.user_id, new Map());
          const userMap = grouped.get(s.user_id)!;
          const prev = userMap.get(key) ?? { count: 0, total: 0, method };
          prev.count += 1;
          prev.total += Number(s.amount ?? 0);
          userMap.set(key, prev);
        }

        const results: Array<{ user_id: string; failures: number }> = [];

        for (const [userId, userMap] of grouped.entries()) {
          const lines: string[] = [];
          let totalFailures = 0;
          let totalAmount = 0;
          for (const [key, v] of userMap.entries()) {
            const [method, reason] = key.split("|");
            lines.push(`• ${method} — ${reason}: ${v.count}× (${v.total.toFixed(2)} MZN)`);
            totalFailures += v.count;
            totalAmount += v.total;
          }
          const message =
            `Últimas 24h: ${totalFailures} falhas — ${totalAmount.toFixed(2)} MZN perdidos\n\n` +
            lines.join("\n");

          await supabaseAdmin.from("marketing_alerts").insert({
            user_id: userId,
            title: "Resumo diário de falhas de pagamento",
            message,
            type: "payment_failure_summary",
          });

          // Optionally fan out to user's Pushcut endpoints
          const { data: hooks } = await supabaseAdmin
            .from("webhook_endpoints")
            .select("url, is_pushcut, active")
            .eq("user_id", userId)
            .eq("is_pushcut", true)
            .eq("active", true);

          for (const h of hooks ?? []) {
            try {
              await fetch(h.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  event: "payment_failure_summary",
                  title: "Resumo diário de falhas",
                  message,
                  total_failures: totalFailures,
                  total_amount_lost: Number(totalAmount.toFixed(2)),
                }),
              });
            } catch (e) {
              console.error("[daily-summary] pushcut failed", { userId, err: String(e) });
            }
          }

          results.push({ user_id: userId, failures: totalFailures });
        }

        return new Response(
          JSON.stringify({ ok: true, users_notified: results.length, results }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
