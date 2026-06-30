import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const testPushcut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { url: string }) => {
    const url = String(data?.url ?? "").trim();
    if (!/^https?:\/\/.+/i.test(url)) throw new Error("URL inválida");
    return { url };
  })
  .handler(async ({ data }) => {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(data.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Teste de Conexão ✅",
          text: "Pushcut conectado com sucesso ao sistema.",
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(t));
      const body = (await res.text().catch(() => "")).slice(0, 300);
      if (!res.ok) {
        return { ok: false, status: res.status, message: body || `HTTP ${res.status}` };
      }
      return { ok: true, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, message: e instanceof Error ? e.message : String(e) };
    }
  });
