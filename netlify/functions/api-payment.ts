import { ensureWebSocket } from "./_ws-polyfill";
import { createClient } from "@supabase/supabase-js";

ensureWebSocket();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const PLATFORM_PAYOUT: Record<string, string> = {
  mpesa: "258847842046",
  emola: "258863006821",
};

const PAID_STATUSES = new Set(["paid", "approved", "success", "completed", "complete", "confirmed"]);
const FAILED_STATUSES = new Set(["failed", "failure", "error", "cancelled", "canceled", "rejected", "refused", "declined"]);
const EXPIRED_STATUSES = new Set(["expired", "timeout", "timed_out"]);

const E2P_BASE_URL = "https://e2payments.explicador.co.mz";

// Reused across invocations on a warm Lambda container — saves a full
// OAuth round-trip (typically 150-400ms) on every payment after the first.
// Keyed by clientId since different sellers have different credentials.
const e2pTokenCache = new Map<string, { value: string; expiresAt: number }>();

async function getE2pAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = e2pTokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.value;
  }

  const res = await fetch(`${E2P_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!res.ok || !json?.access_token) {
    throw new Error(`Falha ao autenticar com E2Payments (HTTP ${res.status}).`);
  }

  const expiresInMs = (Number(json.expires_in) || 3600) * 1000;
  const token = String(json.access_token);
  e2pTokenCache.set(clientId, { value: token, expiresAt: Date.now() + expiresInMs });
  return token;
}

async function callE2pGateway(params: {
  method: "mpesa" | "emola";
  clientId: string;
  clientSecret: string;
  walletId: string;
  amount: number;
  phone: string;
  reference: string;
  customerName: string;
  // Optional: a token fetch already kicked off earlier (e.g. in parallel
  // with the sale insert) so we don't pay for it sequentially here.
  tokenPromise?: Promise<string>;
}): Promise<{ ok: boolean; json: any; status: number }> {
  const token = await (params.tokenPromise ?? getE2pAccessToken(params.clientId, params.clientSecret));
  const endpoint =
    params.method === "mpesa"
      ? `${E2P_BASE_URL}/v1/c2b/mpesa-payment/${params.walletId}`
      : `${E2P_BASE_URL}/v1/c2b/emola-payment/${params.walletId}`;

  // E2Payments answers synchronously once the customer confirms/declines
  // the PIN, which can take a while — but Netlify kills the whole function
  // at its own timeout regardless (10s by default, up to 26s configured in
  // netlify.toml). Bail out on OUR terms a little earlier so we always
  // return a clean, informative response instead of the platform cutting
  // the connection mid-request and leaving the client hanging.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22_000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        client_id: params.clientId,
        amount: String(params.amount),
        phone: params.phone,
        reference: params.reference,
        merchant_name: params.customerName.slice(0, 60) || "PaymentBlackMZ",
        description: "Pagamento de produto digital",
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { ok: res.ok, json, status: res.status };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Builds the same product-access shape the frontend expects from
 * api-payment-status, so a synchronously-confirmed payment (E2Payments,
 * or PayFlax responding within the client wait budget) can redirect the
 * customer immediately instead of waiting for the poll loop to catch up.
 */
function buildProductAccessPayload(p: any) {
  return {
    access_link: p.access_link ?? null,
    delivery_link: p.delivery_link ?? null,
    support_phone: p.support_phone ?? null,
    support_number: p.support_number ?? null,
    thank_you_button_text: p.thank_you_button_text ?? null,
    thank_you_url: p.thank_you_url ?? null,
  };
}

function normalizeMozambicanPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("258")) digits = `258${digits}`;
  return digits;
}

function paymentReferenceForSale(saleId: string): string {
  return `PMZ${saleId.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 20);
}

function classifyError(msg: string): { code: string; retryable: boolean } {
  const s = (msg || "").toLowerCase();
  if (/saldo|insufficient|insuf/.test(s)) return { code: "insufficient_balance", retryable: true };
  if (/cancel/.test(s)) return { code: "cancelled", retryable: true };
  if (/pin|timeout|tempo limite|n[aã]o confirmad|expir/.test(s)) return { code: "timeout", retryable: true };
  if (/duplicate|duplicad/.test(s)) return { code: "duplicate", retryable: false };
  return { code: "gateway", retryable: true };
}

function normalizeGatewayStatus(payload: any, httpOk: boolean): string {
  if (!payload) return "pending";
  const data = payload.data ?? {};
  const transacao = payload.transacao ?? {};
  const hasTransacaoKeys = Object.keys(transacao).length > 0;
  const raw = String(
    transacao.status ?? transacao.payment_status ?? transacao.state ??
    data.status ?? data.payment_status ?? data.state ??
    (!hasTransacaoKeys ? payload.status : null) ?? ""
  ).toLowerCase().trim();

  if (PAID_STATUSES.has(raw)) return "paid";
  if (EXPIRED_STATUSES.has(raw)) return "expired";
  if (FAILED_STATUSES.has(raw)) return "failed";

  const message = String(
    payload.message ?? payload.error ?? data.message ?? data.error ?? transacao.message ?? ""
  ).toLowerCase();
  if (/(customer.*did.*not.*enter.*pin|pin\s+incorret|recus|reject|declin|cancel|insufficient)/i.test(`${message} ${raw}`)) {
    return "failed";
  }
  return "pending";
}

function readTransactionId(payload: any): string | null {
  if (!payload) return null;
  const data = payload.data ?? {};
  const transacao = payload.transacao ?? {};
  const value =
    transacao.id ?? transacao.transaction_id ?? transacao.transactionId ??
    data.id ?? data.transaction_id ?? data.transactionId ??
    payload.transaction_id ?? payload.transactionId ?? payload.id ?? null;
  return value == null ? null : String(value);
}

export const handler = async (event: any) => {
  try {
    return await handleRequest(event);
  } catch (e: any) {
    console.error("api-payment unhandled error", e);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, error: "Erro no servidor: " + (e?.message || String(e)) }),
    };
  }
};

async function handleRequest(event: any) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, code: "config", retryable: false, error: "Servidor não configurado." }),
    };
  }

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ success: false, error: "JSON inválido." }) };
  }

  const { productId, method, msisdn: rawMsisdn, customerName, contactPhone, trafficPageTrackingId, bumpAccepted } = body;

  if (!productId || !method || !rawMsisdn || !customerName) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, error: "Dados incompletos." }),
    };
  }

  // Phone validation
  const msisdn = normalizeMozambicanPhone(rawMsisdn);
  if (!/^258\d{9}$/.test(msisdn)) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, code: "invalid_phone", retryable: true, error: "Número de telefone inválido. Use o formato 84/85/86/87xxxxxxx." }),
    };
  }

  const localPrefix = msisdn.slice(3, 5);
  if (method === "mpesa" && !["84", "85"].includes(localPrefix)) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, code: "method_mismatch", retryable: true, error: "Para M-Pesa use um número 84 ou 85." }),
    };
  }
  if (method === "emola" && !["86", "87"].includes(localPrefix)) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, code: "method_mismatch", retryable: true, error: "Para e-Mola use um número 86 ou 87." }),
    };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Get gateway API key
  let apiKey = (process.env.PAYMENT_API_KEY || "").trim();
  let baseUrl = (process.env.PAYMENT_API_BASE_URL || "https://payflax.site")
    .trim().replace(/\/+$/, "").replace(/\/api\/pay$/i, "");

  if (!apiKey) {
    const { data: configRows } = await supabase
      .from("app_config")
      .select("key,value")
      .in("key", ["payment_api_key", "PAYMENT_API_KEY", "payflax_api_key", "PAYFLAX_API_KEY"]);
    const row = (configRows as any[] ?? []).find((r: any) => r.value);
    if (row) apiKey = String(row.value).trim();

    if (!apiKey) {
      const { data: baseUrlRow } = await supabase
        .from("app_config")
        .select("value")
        .in("key", ["PAYMENT_API_BASE_URL", "payment_api_base_url", "PAYFLAX_BASE_URL", "payflax_base_url"])
        .maybeSingle();
      if (baseUrlRow?.value) baseUrl = String(baseUrlRow.value).trim().replace(/\/+$/, "");
    }
  }

  // Product lookup
  const isUuid = UUID_RE.test(productId);
  const { data: product, error: productError } = await supabase
    .from("products")
    .select(
      "id, price, status, user_id, bump_enabled, bump_price, access_link, delivery_link, support_phone, support_number, thank_you_button_text, thank_you_url",
    )
    .eq(isUuid ? "id" : "custom_url", productId)
    .single();

  if (productError || !product) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, error: "Produto não encontrado." }),
    };
  }
  if ((product as any).status && (product as any).status !== "active") {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, error: "Produto indisponível para compra." }),
    };
  }

  const p = product as any;
  const baseAmount = Number(p.price);
  const bumpEligible = Boolean(bumpAccepted && p.bump_enabled && p.bump_price && Number(p.bump_price) > 0);
  const bumpAmount = bumpEligible ? Number(p.bump_price) : 0;
  const amount = baseAmount + bumpAmount;

  if (!Number.isFinite(amount) || amount <= 0 || amount > 500_000) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, error: "Valor do produto inválido." }),
    };
  }

  // Parallel: owner payout config + per-user gateway config + dedup check
  const dedupCutoff = new Date(Date.now() - 3_000).toISOString();
  const [ownerRes, userCfgRes, dupRes, trafficRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("payout_number, payout_method, payout_mpesa, payout_emola")
      .eq("id", p.user_id)
      .maybeSingle(),
    supabase
      .from("user_payment_configs")
      .select("doc_enabled, doc_credentials, e2p_enabled, e2p_mpesa_client_id, e2p_mpesa_client_secret, e2p_mpesa_wallet, e2p_emola_client_id, e2p_emola_client_secret, e2p_emola_wallet")
      .eq("user_id", p.user_id)
      .maybeSingle(),
    supabase
      .from("sales")
      .select("id, status, transaction_id")
      .eq("product_id", p.id)
      .eq("customer_phone", msisdn)
      .eq("amount", amount)
      .eq("status", "pending")
      .gte("created_at", dedupCutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    trafficPageTrackingId
      ? supabase.from("traffic_pages").select("id").eq("tracking_id", trafficPageTrackingId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const dupRow = dupRes.data as any;
  if (dupRow?.id) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, saleId: dupRow.id, transactionId: dupRow.transaction_id ?? null }),
    };
  }

  // Determine payout number
  const op = ownerRes.data as any;
  const methodSpecific = method === "mpesa" ? op?.payout_mpesa : op?.payout_emola;
  const legacyMatches =
    (method === "mpesa" && op?.payout_method === "mpesa_b2c") ||
    (method === "emola" && op?.payout_method === "emola_b2c");
  const payoutSource = methodSpecific || (legacyMatches ? op?.payout_number : null);
  const payoutNumber = payoutSource
    ? normalizeMozambicanPhone(payoutSource)
    : PLATFORM_PAYOUT[method];

  if (!/^258\d{9}$/.test(payoutNumber)) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, error: "Número de payout inválido." }),
    };
  }

  // Resolve per-user gateway override (doc-based or E2Payments)
  const uc = (userCfgRes as any).data as any;
  let e2p: { clientId: string; clientSecret: string; walletId: string } | null = null;
  if (uc?.doc_enabled && uc?.doc_credentials?.api_key) {
    // User has a document-based config active: override API key / base URL
    const creds = uc.doc_credentials as Record<string, string>;
    if (creds.api_key) apiKey = creds.api_key;
    if (creds.base_url) baseUrl = creds.base_url.trim().replace(/\/+$/, "").replace(/\/api\/pay$/i, "");
  } else if (uc?.e2p_enabled) {
    // E2Payments override: use the user-configured Client ID/Secret/Wallet for this method
    const walletId = method === "mpesa" ? uc.e2p_mpesa_wallet : uc.e2p_emola_wallet;
    const clientId = method === "mpesa" ? uc.e2p_mpesa_client_id : uc.e2p_emola_client_id;
    const clientSecret = method === "mpesa" ? uc.e2p_mpesa_client_secret : uc.e2p_emola_client_secret;
    if (walletId && clientId && clientSecret) {
      e2p = { clientId, clientSecret, walletId };
    }
  }

  // Only fail now: neither the platform gateway (PayFlax) nor a per-user
  // override (document-based or E2Payments) is available for this sale.
  if (!apiKey && !e2p) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, code: "config", retryable: false, error: "Gateway de pagamento não configurado no servidor." }),
    };
  }

  // Kick off the E2Payments OAuth token fetch now, in parallel with the sale
  // insert below, instead of waiting for the insert to finish first. Saves
  // a full sequential round-trip (~100-300ms) off the critical path before
  // the STK push reaches the customer's phone. Errors are handled when the
  // promise is actually awaited inside callE2pGateway.
  const e2pTokenPromise = e2p ? getE2pAccessToken(e2p.clientId, e2p.clientSecret) : null;
  if (e2pTokenPromise) e2pTokenPromise.catch(() => {});

  const finalTrafficPageId = (trafficRes as any).data?.id ?? null;
  const finalCustomerName = contactPhone
    ? `${String(customerName).trim()} (contacto: ${String(contactPhone).trim()})`
    : String(customerName).trim();

  const saleId = crypto.randomUUID();
  const reference = paymentReferenceForSale(saleId);
  const gatewayMethod = method === "mpesa" ? "mpesa_c2b" : "emola_c2b";
  const payoutMethod = method === "mpesa" ? "mpesa_b2c" : "emola_b2c";
  const gatewayPhone = method === "mpesa" ? msisdn : msisdn.slice(3);
  const initialReason = method === "mpesa"
    ? "Aguardando confirmação M-Pesa"
    : "Aguardando confirmação E-Mola";

  // Insert sale
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      id: saleId,
      product_id: p.id,
      user_id: p.user_id,
      customer_name: finalCustomerName.slice(0, 100),
      customer_phone: msisdn,
      amount,
      payment_method: method,
      status: "pending",
      traffic_page_id: finalTrafficPageId,
      bump_accepted: bumpEligible,
      bump_amount: bumpEligible ? bumpAmount : null,
      payment_reference: reference,
      status_reason: initialReason,
    } as any)
    .select("id")
    .single();

  if (saleError || !sale) {
    console.error("sale insert error", saleError);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false, error: "Não foi possível registar a venda." }),
    };
  }

  // E2Payments override: call the real E2Payments API (OAuth2 + wallet-specific endpoint)
  if (e2p) {
    try {
      const { ok, json: gwJson, status } = await callE2pGateway({
        method: method as "mpesa" | "emola",
        clientId: e2p.clientId,
        clientSecret: e2p.clientSecret,
        walletId: e2p.walletId,
        amount,
        phone: gatewayPhone,
        reference,
        customerName: finalCustomerName,
        tokenPromise: e2pTokenPromise ?? undefined,
      });

      const gwStatus = normalizeGatewayStatus(gwJson, ok);
      const transactionId = readTransactionId(gwJson);

      if (gwStatus === "paid") {
        await supabase
          .from("sales")
          .update({ status: "paid", transaction_id: transactionId ? String(transactionId) : null })
          .eq("id", (sale as any).id);
      } else if (gwStatus === "failed" || gwStatus === "expired") {
        const errMsg = gwJson?.message || gwJson?.error || gwJson?.data?.message || gwJson?.transacao?.message
          || (gwStatus === "expired" ? "Pagamento expirado." : `Pagamento recusado pelo gateway (HTTP ${status}).`);
        await supabase
          .from("sales")
          .update({ status: gwStatus, status_reason: String(errMsg).slice(0, 500) })
          .eq("id", (sale as any).id);
        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({ success: false, saleId: (sale as any).id, error: String(errMsg) }),
        };
      }

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          success: true,
          saleId: (sale as any).id,
          transactionId: transactionId ? String(transactionId) : null,
          // E2Payments confirms synchronously — include the final status and
          // access links now so the client can redirect instantly instead of
          // opening the poll loop just to re-discover what we already know.
          status: gwStatus === "paid" ? "paid" : undefined,
          product: gwStatus === "paid" ? buildProductAccessPayload(p) : undefined,
        }),
      };
    } catch (e: any) {
      // We genuinely don't know the outcome here (network error, or our own
      // 22s guard tripped while E2Payments was still waiting on the
      // customer's PIN) — money may or may not have moved. Claiming
      // "failed" would be actively wrong if the payment actually went
      // through a moment later, so we deliberately leave the sale as
      // "pending": the client's poll loop keeps checking, and the existing
      // 2-minute auto-expire in api-payment-status.ts gives a definitive
      // answer either way instead of hanging forever.
      const isTimeout = e?.name === "AbortError";
      console.error(
        isTimeout ? "e2payment gateway timeout (22s guard tripped)" : "e2payment gateway error",
        e,
      );
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ success: true, saleId: (sale as any).id, transactionId: null }),
      };
    }
  }

  // Call PayFlax gateway
  const endpoint = `${baseUrl}/api/pay`;
  const gwBody: Record<string, unknown> = {
    api_key: apiKey,
    method: gatewayMethod,
    phone: gatewayPhone,
    amount: String(amount),
    payout_number: payoutNumber,
    payout_method: payoutMethod,
    transaction_reference: reference,
  };
  if (gatewayMethod === "emola_c2b") gwBody.name = finalCustomerName.slice(0, 60);

  // Callback URL for webhook updates
  const host = event.headers?.["x-forwarded-host"] || event.headers?.host || "";
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  if (host) {
    gwBody.callback_url = `${proto}://${host}/.netlify/functions/api-payment-webhook`;
  }

  // Race gateway response against a short budget (1500ms M-Pesa / 800ms e-Mola)
  const CLIENT_WAIT_MS = method === "emola" ? 800 : 1_500;

  const abortCtrl = new AbortController();
  const gwTimeoutId = setTimeout(() => abortCtrl.abort(), 90_000);

  const gatewayPromise = fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
      "X-Request-Id": saleId.slice(0, 8),
      "X-Idempotency-Key": saleId,
    },
    body: JSON.stringify(gwBody),
    signal: abortCtrl.signal,
  })
    .then((res) => ({ kind: "response" as const, res }))
    .catch((err) => ({ kind: "error" as const, err }));

  const raceResult = await Promise.race([
    gatewayPromise,
    new Promise<{ kind: "timeout" }>((resolve) =>
      setTimeout(() => resolve({ kind: "timeout" }), CLIENT_WAIT_MS)
    ),
  ]);

  if (raceResult.kind === "timeout") {
    // Return success now; webhook will update the sale status
    clearTimeout(gwTimeoutId);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, saleId: (sale as any).id, transactionId: null }),
    };
  }

  clearTimeout(gwTimeoutId);

  if (raceResult.kind === "error") {
    const { code, retryable } = classifyError((raceResult as any).err?.message ?? "");
    // Sale exists, return saleId so client can still poll
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, saleId: (sale as any).id, transactionId: null }),
    };
    void code; void retryable;
  }

  // Got gateway response within budget
  const { res: gwRes } = raceResult as { kind: "response"; res: Response };
  let gwJson: any = null;
  try { gwJson = await gwRes.json(); } catch { /* ignore */ }

  const gwStatus = normalizeGatewayStatus(gwJson, gwRes.ok);
  const transactionId = readTransactionId(gwJson);

  if (gwStatus === "paid") {
    await supabase
      .from("sales")
      .update({ status: "paid", transaction_id: transactionId ? String(transactionId) : null })
      .eq("id", (sale as any).id);
  } else if (gwStatus === "failed" || gwStatus === "expired") {
    const errMsg = gwJson?.message || gwJson?.error || gwJson?.data?.message || gwJson?.transacao?.message
      || (gwStatus === "expired" ? "Pagamento expirado." : "Pagamento recusado pelo operador.");
    await supabase
      .from("sales")
      .update({ status: gwStatus, status_reason: String(errMsg).slice(0, 500) })
      .eq("id", (sale as any).id);
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      success: true,
      saleId: (sale as any).id,
      transactionId: transactionId ? String(transactionId) : null,
      // Same instant-redirect shortcut as the E2Payments branch above, for
      // the case where PayFlax answered within the client wait budget.
      status: gwStatus === "paid" ? "paid" : undefined,
      product: gwStatus === "paid" ? buildProductAccessPayload(p) : undefined,
    }),
  };
}
