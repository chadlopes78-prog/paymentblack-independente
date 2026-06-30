import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PAID_STATUSES = new Set([
  "success",
  "successful",
  "paid",
  "completed",
  "complete",
  "approved",
  "confirmed",
  "processed",
]);
const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "cancelled",
  "canceled",
  "rejected",
  "refused",
  "declined",
  "denied",
]);
const EXPIRED_STATUSES = new Set(["expired", "timeout", "timed_out"]);

export type NormalizedPaymentStatus = "paid" | "failed" | "expired" | "pending";

type GatewayPayload = Record<string, unknown>;
type SaleForConfirmation = {
  id: string;
  status?: string | null;
  user_id?: string | null;
  product_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount?: number | string | null;
  payment_method?: string | null;
  transaction_id?: string | null;
  payment_reference?: string | null;
  traffic_page_id?: string | null;
  created_at?: string | null;
  products?: { name?: string | null } | null;
};

const SALE_CONFIRMATION_SELECT =
  "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method, transaction_id, payment_reference, traffic_page_id, created_at, products(name)";

function asObject(value: unknown): GatewayPayload {
  return value && typeof value === "object" ? (value as GatewayPayload) : {};
}

function nestedObject(payload: GatewayPayload, key: string): GatewayPayload {
  return asObject(payload[key]);
}

function gatewayStepPayload(payload: GatewayPayload, key: string): GatewayPayload {
  const step = nestedObject(payload, key);
  const parsed = nestedObject(step, "parsed");
  return { ...step, ...parsed };
}

function isGatewayStepSuccess(step: GatewayPayload) {
  const errorCode = String(step.errorCode ?? step.error_code ?? step.output_ResponseCode ?? step.code ?? "")
    .toLowerCase()
    .trim();
  const message = String(
    step.message ?? step.output_ResponseDesc ?? step.description ?? step.status ?? step.result ?? "",
  ).toLowerCase();

  return (
    errorCode === "0" ||
    errorCode === "ins-0" ||
    /\bsuccess(?:ful|fully)?\b|sucesso|completed|aprovad|confirmad/.test(message)
  );
}

function hasPayflaxSettlementSuccess(payload: GatewayPayload, data: GatewayPayload, transacao: GatewayPayload) {
  const scopes = [payload, data, transacao];
  const providerSuccess = scopes.some((scope) =>
    isGatewayStepSuccess(gatewayStepPayload(scope, "provider_response")),
  );
  const payoutSuccess = scopes.some((scope) => isGatewayStepSuccess(gatewayStepPayload(scope, "payout_result")));
  const feeSuccess = scopes.some(
    (scope) =>
      isGatewayStepSuccess(gatewayStepPayload(scope, "fee_result_1")) ||
      isGatewayStepSuccess(gatewayStepPayload(scope, "fee_result")) ||
      isGatewayStepSuccess(gatewayStepPayload(scope, "fee_result_2")),
  );
  const hasPayoutAmount = scopes.some((scope) => {
    const value = Number(scope.payout_amount ?? scope.net_amount ?? scope.received_amount ?? 0);
    return Number.isFinite(value) && value > 0;
  });

  // Payflax can leave `transacao.status` as pending even after the wallet
  // collection/provider step returns errorCode "0" / "Successfully".
  // At that point the customer has paid; payout/fee settlement may finish a
  // little later and must not block the checkout redirect.
  return providerSuccess || (payoutSuccess && (feeSuccess || hasPayoutAmount));
}

export function paymentReferenceForSale(saleId: string) {
  return `PMZ${saleId.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
}

export function readGatewayTransactionId(input: unknown): string | null {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const transacao = nestedObject(payload, "transacao");
  const value =
    payload.transaction_id ??
    payload.transactionId ??
    payload.payment_id ??
    payload.paymentId ??
    payload.id ??
    data.transaction_id ??
    data.transactionId ??
    data.payment_id ??
    data.paymentId ??
    data.id ??
    transacao.transaction_id ??
    transacao.transactionId ??
    transacao.payment_id ??
    transacao.paymentId ??
    transacao.id ??
    null;
  return value == null ? null : String(value);
}

export function readGatewayReference(input: unknown): string | null {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const transacao = nestedObject(payload, "transacao");
  const value =
    payload.reference ??
    payload.external_reference ??
    payload.merchant_reference ??
    payload.transaction_reference ??
    data.reference ??
    data.external_reference ??
    data.merchant_reference ??
    data.transaction_reference ??
    transacao.reference ??
    transacao.external_reference ??
    transacao.merchant_reference ??
    transacao.transaction_reference ??
    null;
  return value == null ? null : String(value);
}

export function readGatewayMessage(input: unknown): string | null {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const transacao = nestedObject(payload, "transacao");
  const provider = {
    ...nestedObject(payload, "provider_response"),
    ...nestedObject(data, "provider_response"),
    ...nestedObject(transacao, "provider_response"),
  };
  const providerParsed = nestedObject(provider, "parsed");
  const value =
    payload.message ??
    payload.error ??
    payload.detail ??
    payload.output_ResponseDesc ??
    data.message ??
    data.error ??
    data.detail ??
    data.output_ResponseDesc ??
    transacao.message ??
    transacao.error ??
    transacao.detail ??
    transacao.output_ResponseDesc ??
    provider.message ??
    provider.error ??
    provider.detail ??
    provider.output_ResponseDesc ??
    providerParsed.message ??
    providerParsed.error_description ??
    providerParsed.output_ResponseDesc ??
    null;
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function normalizeGatewayStatus(input: unknown, httpOk = true): NormalizedPaymentStatus {
  const payload = asObject(input);
  const data = nestedObject(payload, "data");
  const transacao = nestedObject(payload, "transacao");
  const provider = {
    ...nestedObject(payload, "provider_response"),
    ...nestedObject(data, "provider_response"),
    ...nestedObject(transacao, "provider_response"),
  };
  const providerParsed = nestedObject(provider, "parsed");
  const successValue = payload.success ?? payload.ok ?? data.success ?? data.ok;
  const hasTransactionObject = Object.keys(transacao).length > 0;
  // Prefer the real transaction object over the top-level HTTP envelope.
  // Payflax can return `{ status: "success", transacao: { status: "pending" } }`
  // when the PIN prompt was merely created. Treating the wrapper as terminal
  // would approve a payment before backend confirmation, which is unsafe.
  const raw = String(
    transacao.status ??
      transacao.payment_status ??
      transacao.state ??
      transacao.result ??
      data.status ??
      data.payment_status ??
      data.state ??
      data.result ??
      (hasTransactionObject ? null : payload.status) ??
      (hasTransactionObject ? null : payload.payment_status) ??
      (hasTransactionObject ? null : payload.state) ??
      (hasTransactionObject ? null : payload.result) ??
      "",
  )
    .toLowerCase()
    .trim();
  const successText = String(successValue ?? "")
    .toLowerCase()
    .trim();

  if (PAID_STATUSES.has(raw)) return "paid";
  if (EXPIRED_STATUSES.has(raw)) return "expired";
  if (FAILED_STATUSES.has(raw)) return "failed";

  const message = String(
    payload.message ??
      payload.error ??
      payload.detail ??
      data.message ??
      data.error ??
      data.detail ??
      transacao.message ??
      transacao.error ??
      transacao.detail ??
      provider.message ??
      provider.error ??
      provider.detail ??
      provider.output_ResponseDesc ??
      providerParsed.message ??
      providerParsed.error_description ??
      providerParsed.output_ResponseDesc ??
      "",
  ).toLowerCase();
  // Não marcar como "paid" apenas por success:true / mensagem "sucesso" —
  // gateways como Payflax retornam isso ao só solicitar o PIN ao cliente.
  // Apenas status explícitos em PAID_STATUSES contam como aprovado.
  void successText;
  if (
    /(customer\s+did\s+not\s+enter\s+pin|pin\s+incorret|recus|reject|declin|cancel|insufficient|saldo\s+insuficiente)/i.test(
      `${message} ${raw}`,
    )
  ) {
    return "failed";
  }
  if (
    successValue === false &&
    httpOk &&
    /(recus|reject|declin|cancel|fail|erro|expir)/i.test(message)
  ) {
    return message.includes("expir") ? "expired" : "failed";
  }

  if (httpOk && hasPayflaxSettlementSuccess(payload, data, transacao)) {
    return "paid";
  }

  return "pending";
}

export type FailureReasonCode =
  | "insufficient_funds"
  | "invalid_number"
  | "account_not_registered"
  | "timeout"
  | "cancelled"
  | "service_unavailable"
  | "network_error"
  | "daily_limit"
  | "amount_limit"
  | "internal_error"
  | "unknown_error";

export type PendingReasonCode =
  | "awaiting_emola_confirmation"
  | "awaiting_mpesa_confirmation"
  | "awaiting_customer_payment"
  | "payment_started"
  | "processing"
  | "timeout";

function walletLabel(method: string | null | undefined): "E-Mola" | "M-Pesa" | null {
  const m = (method || "").toLowerCase();
  if (m.includes("mpesa")) return "M-Pesa";
  if (m.includes("emola") || m.includes("e-mola") || m.includes("mola")) return "E-Mola";
  return null;
}

function withWallet(prefix: string, wallet: "E-Mola" | "M-Pesa" | null, fallback: string) {
  return wallet ? `${prefix} ${wallet}` : fallback;
}

const PENDING_REASON_LABELS: Record<PendingReasonCode, string> = {
  awaiting_emola_confirmation: "Aguardando resposta da E-Mola",
  awaiting_mpesa_confirmation: "Aguardando resposta da M-Pesa",
  awaiting_customer_payment: "Aguardando confirmação do pagamento",
  payment_started: "Pagamento iniciado mas ainda não confirmado",
  processing: "Processamento em andamento",
  timeout: "Tempo limite de confirmação excedido",
};

export function classifyFailureReason(
  message: string | null | undefined,
  status?: "failed" | "expired",
  method?: string | null,
): { code: FailureReasonCode; label: string } {
  const m = (message || "").toLowerCase();
  const wallet = walletLabel(method);

  if (status === "expired" || /(expir|timeout|timed?[\s_-]?out|tempo\s+limite|tempo\s+esgotad)/i.test(m)) {
    return { code: "timeout", label: "Tempo limite de confirmação excedido" };
  }
  if (/(insufficient|saldo\s+insuficiente|sem\s+saldo|no\s+balance|without\s+balance)/i.test(m)) {
    return {
      code: "insufficient_funds",
      label: withWallet("Saldo insuficiente na carteira", wallet, "Saldo insuficiente na carteira"),
    };
  }
  if (/(not[\s_-]?registered|n(ã|a)o\s+registad|account[\s_-]?not[\s_-]?found|conta\s+n(ã|a)o)/i.test(m)) {
    return {
      code: "account_not_registered",
      label: withWallet("Conta não registada na", wallet, "Conta de pagamento não registada"),
    };
  }
  if (/(invalid[\s_-]?number|n(ú|u)mero\s+inv(á|a)lido|invalid[\s_-]?msisdn|msisdn\s+invalid|n(ú|u)mero\s+incorret)/i.test(m)) {
    return {
      code: "invalid_number",
      label: withWallet("Número inválido para", wallet, "Número de telefone inválido"),
    };
  }
  // Telco/gateway returned "Customer did not enter PIN" (errorCode 11) —
  // this is a PIN timeout on the customer's phone, NOT a deliberate cancel.
  // Surface a clear, actionable message so users know to retry quickly.
  if (/(did\s+not\s+enter\s+pin|pin\s+n(ã|a)o\s+(foi\s+)?(digitad|introduzid|inserid)|errorcode["']?\s*[:=]\s*["']?11\b|timeout.*pin|pin.*timeout)/i.test(m)) {
    return {
      code: "timeout",
      label: "PIN não confirmado a tempo. Tente novamente e digite o PIN assim que receber a notificação.",
    };
  }
  if (/(pin\s+incorret|wrong\s+pin|invalid\s+pin|pin\s+inv(á|a)lid)/i.test(m)) {
    return { code: "cancelled", label: "PIN incorreto. Tente novamente." };
  }
  if (/(cancel|recus|reject|declin|denied)/i.test(m)) {
    return { code: "cancelled", label: "Transação cancelada pelo utilizador" };
  }
  if (/(service\s+unavailable|indispon(í|i)vel|temporariamente|maintenance|manuten(ç|c)(ã|a)o|503)/i.test(m)) {
    return {
      code: "service_unavailable",
      label: withWallet("Serviço temporariamente indisponível:", wallet, "Serviço de pagamento temporariamente indisponível"),
    };
  }
  if (/(network|conex(ã|a)o|connection|offline|unreachable|fetch\s+failed|abort|comunica(ç|c)(ã|a)o|operadora)/i.test(m)) {
    return { code: "network_error", label: "Falha de comunicação com a operadora" };
  }
  if (/(daily[\s_-]?limit|limite\s+di(á|a)rio)/i.test(m)) {
    return { code: "daily_limit", label: "Limite diário de transações atingido" };
  }
  if (/(amount[\s_-]?limit|valor\s+acima|exceeds?\s+limit|limit\s+exceeded|maximum\s+amount)/i.test(m)) {
    return { code: "amount_limit", label: "Valor da transação acima do limite permitido" };
  }
  if (/(internal[\s_-]?error|erro\s+interno|server\s+error|500)/i.test(m)) {
    return { code: "internal_error", label: "Erro interno do sistema" };
  }
  // Transparency: surface the raw gateway message when present and reasonable.
  const trimmed = (message || "").trim();
  if (trimmed.length > 0 && trimmed.length <= 200) {
    return { code: "unknown_error", label: trimmed };
  }
  return { code: "unknown_error", label: "Erro desconhecido no processamento" };
}

export function pendingReasonForMethod(
  method: string | null | undefined,
  variant: "awaiting_customer" | "processing" | "timeout" = "awaiting_customer",
): { code: PendingReasonCode; label: string } {
  if (variant === "processing") {
    return { code: "processing", label: PENDING_REASON_LABELS.processing };
  }
  if (variant === "timeout") {
    return { code: "timeout", label: PENDING_REASON_LABELS.timeout };
  }
  const m = (method || "").toLowerCase();
  if (m.includes("mpesa")) {
    return { code: "awaiting_mpesa_confirmation", label: PENDING_REASON_LABELS.awaiting_mpesa_confirmation };
  }
  if (m.includes("emola")) {
    return { code: "awaiting_emola_confirmation", label: PENDING_REASON_LABELS.awaiting_emola_confirmation };
  }
  return { code: "awaiting_customer_payment", label: PENDING_REASON_LABELS.awaiting_customer_payment };
}

async function fetchSaleById(saleId: string) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select(SALE_CONFIRMATION_SELECT)
    .eq("id", saleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findSaleForGatewayEvent(
  transactionId: string | null,
  reference: string | null,
) {
  if (transactionId) {
    const { data, error } = await supabaseAdmin
      .from("sales")
      .select(SALE_CONFIRMATION_SELECT)
      .eq("transaction_id", transactionId.slice(0, 200))
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (reference) {
    const { data, error } = await supabaseAdmin
      .from("sales")
      .select(SALE_CONFIRMATION_SELECT)
      .eq("payment_reference", reference.slice(0, 200))
      .maybeSingle();
    if (error) throw error;
    if (data) return data;

    // Payflax names its own gateway identifier `transaction_reference`.
    // Some callbacks send only that field, while our local `payment_reference`
    // stores the PMZ... idempotency key. Resolve both possibilities so a real
    // successful webhook never stays orphaned as pending.
    const byGatewayReference = await supabaseAdmin
      .from("sales")
      .select(SALE_CONFIRMATION_SELECT)
      .eq("transaction_id", reference.slice(0, 200))
      .maybeSingle();
    if (byGatewayReference.error) throw byGatewayReference.error;
    return byGatewayReference.data;
  }

  return null;
}

export async function confirmSalePayment(options: {
  saleId: string;
  transactionId?: string | null;
  reference?: string | null;
  rawPayload?: unknown;
  triggerPushcut?: boolean;
}) {
  const { saleId, transactionId, reference, rawPayload, triggerPushcut = false } = options;

  const updatePayload: {
    status: string;
    payment_reference: string;
    status_reason: null;
    payment_confirmed_at: string;
    payment_failed_at: null;
    transaction_id?: string;
  } = {
    status: "paid",
    payment_reference: reference ? reference.slice(0, 200) : paymentReferenceForSale(saleId),
    status_reason: null,
    payment_confirmed_at: new Date().toISOString(),
    payment_failed_at: null,
  };
  if (transactionId) updatePayload.transaction_id = transactionId.slice(0, 200);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("sales")
    .update(updatePayload)
    .eq("id", saleId)
    .neq("status", "paid")
    .select(SALE_CONFIRMATION_SELECT)
    .maybeSingle();

  if (updateError) throw updateError;

  if (!updated) {
    if (transactionId || reference) {
      await supabaseAdmin
        .from("sales")
        .update({
          ...(transactionId ? { transaction_id: transactionId.slice(0, 200) } : {}),
          ...(reference ? { payment_reference: reference.slice(0, 200) } : {}),
        })
        .eq("id", saleId)
        .eq("status", "paid");
    }
    return { sale: await fetchSaleById(saleId), becamePaid: false };
  }

  await dispatchApprovedSideEffects(updated, rawPayload, triggerPushcut).catch((err) => {
    console.error("[payments] approved side-effects failed", err);
  });

  return { sale: updated, becamePaid: true };
}

export async function markSaleTerminalFailure(options: {
  saleId: string;
  status: "failed" | "expired";
  transactionId?: string | null;
  reference?: string | null;
  reason?: string | null;
  method?: string | null;
}) {
  const { saleId, status, transactionId, reference, reason, method } = options;
  const finalStatus = status === "expired" ? "failed" : "failed";
  let resolvedMethod = method ?? null;
  if (!resolvedMethod) {
    const existing = await fetchSaleById(saleId);
    resolvedMethod = existing?.payment_method ?? null;
  }
  const reasonInfo = classifyFailureReason(reason, status, resolvedMethod);
  // Only set payment_reference when a real gateway reference is supplied.
  // Never fall back to the human-readable reason — it's not unique and
  // collides with `sales_payment_reference_unique` across stale rows.
  const updatePayload: {
    status: string;
    status_reason: string;
    payment_failed_at: string;
    transaction_id?: string;
    payment_reference?: string;
  } = {
    status: finalStatus,
    status_reason: reasonInfo.label,
    payment_failed_at: new Date().toISOString(),
  };
  if (transactionId) updatePayload.transaction_id = transactionId.slice(0, 200);
  if (reference) updatePayload.payment_reference = reference.slice(0, 200);
  const { data: updated, error } = await supabaseAdmin
    .from("sales")
    .update(updatePayload)
    .eq("id", saleId)
    .neq("status", "paid")
    .neq("status", "failed")
    .select(
      "id, status, user_id, product_id, customer_name, customer_phone, amount, payment_method",
    )
    .maybeSingle();

  if (error) throw error;
  if (!updated?.user_id) return { becameFailed: false };

  const { enqueueWebhookEvent, processPendingForUser } =
    await import("@/lib/webhooks/dispatcher.server");
  await enqueueWebhookEvent({
    userId: updated.user_id,
    productId: updated.product_id,
    event: status === "expired" ? "payment.expired" : "payment.refused",
    payload: {
      sale_id: updated.id,
      product_id: updated.product_id,
      customer_name: updated.customer_name,
      customer_phone: updated.customer_phone,
      amount: updated.amount,
      payment_method: updated.payment_method,
      status: finalStatus,
      reason: reason?.slice(0, 200) ?? status,
    },
  });
  await processPendingForUser(updated.user_id);
  return { becameFailed: true };
}

async function dispatchApprovedSideEffects(
  sale: SaleForConfirmation,
  rawPayload: unknown,
  triggerPushcut: boolean,
) {
  const userId = sale.user_id as string | null;
  if (!userId) return;

  // SINGLE-CHANNEL POLICY: Pushcut é entregue exclusivamente via
  // `webhook_endpoints` (is_pushcut=true) configurados pelo utilizador
  // em "Webhooks e Eventos". A via legada baseada em `profiles.pushcut_url`
  // foi desativada para eliminar duplicações por venda. A dedupe é feita
  // por `webhook_deliveries.dedupe_key = approved:${saleId}:${endpointId}`
  // mais o lock por `pushcut_logs.order_id` em `sendPushcutOnce`.

  // Meta Conversions API (CAPI) — single Purchase per confirmed sale.
  // This runs exactly once because `confirmSalePayment` guards the update
  // with `.neq("status","paid")`, so the transition pending→paid fires
  // this side-effect block exactly once. `event_id = sale.id` dedupes
  // against the browser Pixel `fbq('track','Purchase', {}, {eventID})`.
  try {
    const { sendMetaPurchaseCapi } = await import("@/lib/meta/capi.server");
    void sendMetaPurchaseCapi({
      saleId: sale.id,
      userId,
      productId: sale.product_id ?? null,
      amount: sale.amount as number | string | null,
      customerPhone: sale.customer_phone ?? null,
      customerName: sale.customer_name ?? null,
    });
  } catch (e) {
    console.error("[meta-capi] dispatch error (suppressed)", e);
  }



  const { enqueueWebhookEvent, processPendingForUser } =
    await import("@/lib/webhooks/dispatcher.server");

  const productName = sale.products?.name ?? null;
  const payload = {
    sale_id: sale.id,
    product_id: sale.product_id,
    product_name: productName,
    customer_name: sale.customer_name,
    customer_phone: sale.customer_phone,
    amount: sale.amount,
    payment_method: sale.payment_method,
    status: "paid",
    payment_status: "paid",
    transaction_id: sale.transaction_id,
    payment_reference: sale.payment_reference,
    paid_at: new Date().toISOString(),
    pushcut_source: triggerPushcut ? "payment_webhook" : "blocked",
    gateway_payload: rawPayload ?? null,
  };

  // SINGLE EVENT POLICY: insert exactly ONE delivery per endpoint per sale.
  // Bypass the fan-out enqueue helper — for each endpoint we choose the highest
  // priority subscribed event and insert that single delivery directly.
  // Dedupe key `${saleId}` (no event prefix) guarantees that even if this code
  // runs twice for the same sale, the unique index blocks duplicates.
  const PRIORITY = ["sale.approved", "payment.received", "product.delivered"] as const;
  const { data: endpoints } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("id, events, active, product_ids, is_pushcut")
    .eq("user_id", userId)
    .eq("active", true);

  let inserted = 0;
  for (const ep of endpoints ?? []) {
    const events = Array.isArray(ep.events) ? (ep.events as string[]) : [];
    const scope = ep.product_ids as string[] | null;
    const matchesProduct =
      !scope || scope.length === 0 || (sale.product_id ? scope.includes(sale.product_id) : false);
    const chosen = PRIORITY.find((e) => events.includes(e));
    console.log("[webhooks] dispatch decision", {
      endpointId: ep.id,
      saleId: sale.id,
      subscribed: events,
      matchesProduct,
      chosen: chosen ?? null,
      isPushcut: ep.is_pushcut,
      allowedPushcutSource: triggerPushcut,
    });
    if (!matchesProduct || !chosen) continue;
    if (ep.is_pushcut && !triggerPushcut) {
      console.log("[pushcut] blocked: non-webhook source", { orderId: sale.id, endpointId: ep.id });
      continue;
    }

    const { error: insertErr } = await supabaseAdmin
      .from("webhook_deliveries")
      .insert({
        webhook_id: ep.id,
        user_id: userId,
        event: chosen,
        payload: payload as never,
        dedupe_key: `approved:${sale.id}:${ep.id}`,
      });
    if (insertErr) {
      if (insertErr.code !== "23505") {
        console.error("[webhooks] direct enqueue failed", insertErr);
      } else {
        console.log("[webhooks] dedupe skipped", { endpointId: ep.id, saleId: sale.id });
      }
      continue;
    }
    inserted++;
  }
  if (inserted > 0) await processPendingForUser(userId);

  // FALLBACK: se nenhum webhook Pushcut casou com este produto, dispara o
  // Pushcut do perfil (canal legado) para garantir que o vendedor receba a
  // notificação da venda. Dedupe por `profile:${saleId}` em pushcut_logs
  // impede duplicação caso este caminho rode mais de uma vez.
  if (inserted === 0 && triggerPushcut) {
    try {
      const { sendProfilePushcut } = await import("@/lib/pushcut/profile.server");
      await sendProfilePushcut({
        id: sale.id,
        user_id: userId,
        amount: sale.amount ?? null,
        product_id: sale.product_id ?? null,
      });
    } catch (e) {
      console.error("[pushcut][profile-fallback] error (suppressed)", e);
    }
  }
  // Silence unused warning for helper kept for non-approved flows.
  void enqueueWebhookEvent;

  if (sale.traffic_page_id) {
    await supabaseAdmin.from("traffic_events").insert({
      page_id: sale.traffic_page_id,
      event_type: "purchase",
      metadata: { saleId: sale.id, productId: sale.product_id },
    });
  }
}
