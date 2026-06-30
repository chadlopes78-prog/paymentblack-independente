import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const logRecoveryAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string | null; customerPhone: string }) => input)
  .handler(async ({ data, context }) => {
    const phone = (data.customerPhone ?? "").replace(/\D/g, "");
    if (!phone) throw new Error("Telefone inválido");
    const { error } = await (context.supabase.from as any)("recovery_attempts").insert({
      user_id: context.userId,
      product_id: data.productId,
      customer_phone: phone,
    });
    if (error) throw error;
    return { ok: true };
  });

export const resetRecoveryHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase.from as any)("recovery_attempts")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true, resetAt: new Date().toISOString() };
  });
