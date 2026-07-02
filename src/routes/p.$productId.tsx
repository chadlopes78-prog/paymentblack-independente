import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import type { PaymentResult } from "@/lib/api/payments.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  ShieldAlert,
  Package,
  Clock,
  ArrowRight,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import mozFlag from "@/assets/moz-flag.png.asset.json";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_COLS = "id,user_id,name,description,price,image_url,checkout_banner_url,checkout_banner_type,checkout_banner_video_url,timer_enabled,category,status,custom_url,warranty_days,delivery_type,facebook_pixel_id,bump_enabled,bump_title,bump_description,bump_price,bump_image_url,bump_button_text,bump_highlight_color";

// Load product directly from Supabase (anon key + public RLS policy), with Netlify fallback
async function apiGetProduct(productId: string) {
  try {
    const isUuid = UUID_RE.test(productId);
    const col = isUuid ? "id" : "custom_url";

    const { data: product, error } = await supabase
      .from("products")
      .select(PRODUCT_COLS)
      .eq(col, productId)
      .eq("status", "active")
      .maybeSingle();

    if (!error && product) {
      const pixelRes = product.facebook_pixel_id
        ? null
        : await supabase
            .from("pixel_configs")
            .select("fb_pixel_id")
            .eq("user_id", product.user_id)
            .maybeSingle();
      return { product, checkout: null, defaultPixel: pixelRes?.data ?? null };
    }
  } catch {
    // fall through to Netlify function
  }

  // Fallback: Netlify Function (requires SUPABASE_SERVICE_ROLE_KEY on Netlify)
  try {
    const res = await fetch(`/.netlify/functions/api-product?productId=${encodeURIComponent(productId)}`);
    if (res.ok) return res.json();
  } catch {
    // ignore
  }

  return { product: null, checkout: null, defaultPixel: null };
}

async function apiProcessPayment(data: {
  productId: string;
  method: string;
  msisdn: string;
  customerName: string;
  contactPhone?: string;
  trafficPageTrackingId?: string | null;
  bumpAccepted?: boolean;
}): Promise<PaymentResult> {
  const res = await fetch("/.netlify/functions/api-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function apiGetPaymentStatus(saleId: string) {
  try {
    const res = await fetch(`/.netlify/functions/api-payment-status?saleId=${encodeURIComponent(saleId)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/p/$productId")({
  staleTime: 60_000,
  preloadStaleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  loader: async ({ params: { productId } }) => {
    return apiGetProduct(productId);
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product;
    const baseLinks = [
      // NOTE: preconnect/dns-prefetch here only warms a BROWSER→domain
      // connection. The actual gateway calls (PayFlax, E2Payments) happen
      // server-side inside the Netlify Function, so hinting the browser
      // does nothing for that leg — kept only for any client-side asset
      // fetches that might target these hosts.
      { rel: "preconnect", href: "https://payflax.site" },
      { rel: "dns-prefetch", href: "https://payflax.site" },
    ];

    if (!product) return { links: baseLinks };
    const image = product.image_url || "";
    return {
      meta: [
        { title: `${product.name} | PagamentosMZ` },
        { name: "description", content: product.description || "Checkout seguro via M-Pesa e e-Mola" },
        { property: "og:title", content: product.name },
        { property: "og:image", content: image },
      ],
      links: image
        ? [...baseLinks, { rel: "preload", as: "image", href: image, fetchpriority: "high" }]
        : baseLinks,
    };
  },

  pendingComponent: CheckoutSkeleton,
  component: CheckoutPage,
});

function CheckoutSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto w-full max-w-[460px] px-3 py-4 sm:px-4 sm:py-6">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-200/60 overflow-hidden animate-pulse">
          <div className="p-4 flex gap-3 items-center border-b border-slate-100">
            <div className="h-14 w-14 bg-slate-200 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-200 rounded w-3/4" />
              <div className="h-6 bg-slate-200 rounded w-1/3" />
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="h-12 bg-slate-100 rounded-xl" />
            <div className="h-12 bg-slate-100 rounded-xl" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-12 bg-slate-100 rounded-xl" />
              <div className="h-12 bg-slate-100 rounded-xl" />
            </div>
            <div className="h-12 bg-slate-100 rounded-xl" />
            <div className="h-14 bg-slate-200 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

function CheckoutPage() {
  const { productId } = useParams({ from: "/p/$productId" });
  const { product, defaultPixel } = Route.useLoaderData();

  const pixelId = product?.facebook_pixel_id || defaultPixel?.fb_pixel_id;

  const [trafficPageId, setTrafficPageId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);
  const [paymentErrorCode, setPaymentErrorCode] = useState<string | null>(null);
  const [paymentRetryable, setPaymentRetryable] = useState(false);
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [failureModalOpen, setFailureModalOpen] = useState(false);


  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "emola">("mpesa");
  const [bumpAccepted, setBumpAccepted] = useState(false);

  const [timeLeft, setTimeLeft] = useState(360);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fires the Purchase event and redirects to the product's access link.
  // Shared by the instant-confirmation path (gateway answered inside
  // apiProcessPayment) and the polling loop below (gateway confirmed later
  // via the race-timeout / webhook path).
  const confirmAndRedirect = (
    saleId: string,
    productAccess?: {
      thank_you_url?: string | null;
      access_link?: string | null;
      delivery_link?: string | null;
    } | null,
  ) => {
    // Fire the REAL Purchase event exactly once, deduped with the
    // server-side CAPI call via `eventID = saleId`. Meta matches
    // event_id within 48h and counts as a single Purchase.
    trackEvent("Purchase", { content_ids: [product.id], content_type: "product" }, saleId);
    setPaymentConfirmed(true);
    setProcessingPayment(false);

    const rawUrl =
      productAccess?.thank_you_url?.trim() ||
      productAccess?.access_link?.trim() ||
      productAccess?.delivery_link?.trim() ||
      "";
    // Normalize: accept "site.com/x" by prepending https:// when scheme is missing.
    let url = rawUrl;
    if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith("/")) {
      url = `https://${url}`;
    }
    if (url) {
      setPaymentStatusMessage("Pagamento confirmado. Redirecionando para o seu acesso...");
      try {
        // Use assign so the browser respects the new URL even if replace is blocked.
        window.location.assign(url);
      } catch {
        window.location.href = url;
      }
      // Hard fallback if navigation is blocked or delayed.
      setTimeout(() => {
        if (!document.hidden) window.location.href = url;
      }, 1500);
    } else {
      setPaymentStatusMessage(
        "Pagamento confirmado com sucesso. Em instantes você receberá os detalhes de acesso.",
      );
    }
  };

  // Poll sale status in-place after gateway dispatch — no redirect to a waiting page.
  useEffect(() => {
    if (!pendingSaleId) return;
    let cancelled = false;
    let attempts = 0;
    const MAX = 180;
    const TERMINAL_OK = ["paid", "approved", "success", "completed"];
    const TERMINAL_FAIL = ["failed", "expired", "cancelled", "canceled"];
    (async () => {
      while (!cancelled && attempts < MAX) {
        attempts++;
        try {
          const r = (await apiGetPaymentStatus(pendingSaleId)) as
            | {
                sale?: { status?: string | null; status_reason?: string | null } | null;
                product?: {
                  thank_you_url?: string | null;
                  access_link?: string | null;
                  delivery_link?: string | null;
                } | null;
              }
            | null;
          if (cancelled) return;
          const status = String(r?.sale?.status ?? "").toLowerCase();
          if (TERMINAL_OK.includes(status)) {
            confirmAndRedirect(pendingSaleId, r?.product);
            return;
          }
          if (TERMINAL_FAIL.includes(status)) {
            setProcessingPayment(false);
            setPaymentStatusMessage(null);
            setPaymentErrorMessage(
              r?.sale?.status_reason ||
                "Pagamento não confirmado. Tente novamente ou escolha outro método.",
            );
            setPaymentErrorCode(status === "cancelled" || status === "canceled" ? "cancelled" : "gateway");
            setPaymentRetryable(true);
            setPendingSaleId(null);
            setFailureModalOpen(true);
            return;
          }
        } catch (e) {
          console.error("[checkout] poll error", e);
        }
        await new Promise((r) => setTimeout(r, attempts < 20 ? 700 : 1500));
      }
      if (!cancelled) {
        setProcessingPayment(false);
        setPaymentStatusMessage(null);
        setPaymentErrorMessage("Pagamento não confirmado. Tente novamente ou escolha outro método.");
        setPaymentErrorCode("timeout");
        setPaymentRetryable(true);
        setPendingSaleId(null);
        setFailureModalOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [pendingSaleId]);


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tp_id = params.get('tp_id');
    if (tp_id) {
      setTrafficPageId(tp_id);
      supabase.functions.invoke('track-event', {
        body: {
          trackingId: tp_id,
          eventType: 'click',
          url: window.location.href,
          referrer: document.referrer,
          metadata: { productId }
        }
      }).catch((e) => console.error("Error recording click event:", e));
    }
  }, [productId]);

  useEffect(() => {
    if (!pixelId || !product) return;
    try {
      if (!window.fbq) {
        const initFB = (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) => {
          if (f.fbq) return;
          n = f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n;
          n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
          t = b.createElement(e); t.async = !0; t.src = v;
          s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        };
        initFB(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      }
      window.fbq('init', pixelId);
      window.fbq('track', 'PageView');
      window.fbq('track', 'ViewContent', {
        content_name: product.name,
        content_category: product.category,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price,
        currency: 'MZN'
      });
    } catch (e) {
      console.error('FB Pixel error:', e);
    }
  }, [pixelId, product?.id]);

  const trackEvent = (event: string, extra?: Record<string, unknown>, eventID?: string) => {
    try {
      if (pixelId && window.fbq) {
        const opts = eventID ? { eventID } : undefined;
        window.fbq('track', event, {
          content_name: product.name, value: product.price, currency: 'MZN', ...extra,
        }, opts);
      }
    } catch (e) { console.error(e); }
  };


  // Normalize phone input: strip non-digits, drop leading "258" or "0" so the
  // server-side regex (^258\d{9}$) and prefix checks pass without surprises.
  const sanitizePhone = (v: string) => {
    let d = v.replace(/\D/g, "");
    if (d.startsWith("258")) d = d.slice(3);
    if (d.startsWith("0")) d = d.slice(1);
    return d.slice(0, 9);
  };

  const validatePhoneClient = (raw: string): string | null => {
    const d = sanitizePhone(raw);
    if (d.length !== 9) return "Número deve ter 9 dígitos (ex: 84xxxxxxx).";
    const prefix = d.slice(0, 2);
    if (paymentMethod === "mpesa" && !["84", "85"].includes(prefix)) {
      return "Para M-Pesa use um número que comece com 84 ou 85.";
    }
    if (paymentMethod === "emola" && !["86", "87"].includes(prefix)) {
      return "Para e-Mola use um número que comece com 86 ou 87.";
    }
    return null;
  };

  const submitPayment = async () => {
    const phoneError = validatePhoneClient(phone);
    if (phoneError) {
      setPaymentErrorMessage(phoneError);
      setPaymentErrorCode("invalid_phone");
      setPaymentRetryable(true);
      setPaymentStatusMessage(null);
      toast.error(phoneError);
      return;
    }

    setProcessingPayment(true);
    setPaymentErrorMessage(null);
    setPaymentErrorCode(null);
    setPaymentRetryable(false);
    setPaymentStatusMessage(
      `Pedido enviado para ${paymentMethod === "mpesa" ? "M-Pesa" : "e-Mola"}. Confirme no seu telefone digitando o PIN.`,
    );
    trackEvent("InitiateCheckout");

    try {
      const result = await apiProcessPayment({
        productId,
        method: paymentMethod,
        msisdn: sanitizePhone(phone),
        customerName: name,
        contactPhone: contactPhone ? sanitizePhone(contactPhone) : undefined,
        trafficPageTrackingId: trafficPageId,
        bumpAccepted: bumpAccepted && !!product?.bump_enabled,
      }) as PaymentResult;

      if (!result.success) {
        setPaymentErrorMessage(result.error || "Pagamento recusado.");
        setPaymentErrorCode(result.code || "gateway");
        setPaymentRetryable(result.retryable !== false);
        setPaymentStatusMessage(null);
        toast.error(result.error || "Pagamento recusado.");
        setProcessingPayment(false);
        setFailureModalOpen(true);
        return;
      }

      // Gateway already confirmed payment synchronously (E2Payments, or
      // PayFlax answering within the wait budget) — redirect right away
      // instead of opening the poll loop just to re-confirm what we know.
      if (result.status === "paid") {
        confirmAndRedirect(result.saleId, result.product);
        return;
      }

      // Otherwise the gateway has only accepted the request so far; the
      // real Purchase event fires from the polling effect once the sale
      // reaches a TERMINAL_OK status. Dedup with CAPI uses `eventID = saleId`.
      setPaymentStatusMessage(
        `Pedido enviado para ${paymentMethod === "mpesa" ? "M-Pesa" : "e-Mola"}. Digite o PIN no seu telefone para concluir o pagamento.`,
      );

      setPendingSaleId(result.saleId);
    } catch (error: any) {
      setPaymentErrorMessage(error?.message || "Erro inesperado ao processar pagamento.");
      setPaymentErrorCode("internal");
      setPaymentRetryable(true);
      setPaymentStatusMessage(null);
      toast.error("Erro ao processar pagamento: " + error.message);
      setProcessingPayment(false);
      setFailureModalOpen(true);
    }
  };

  const retryPayment = () => {
    setFailureModalOpen(false);
    setPaymentErrorMessage(null);
    setPaymentErrorCode(null);
    setPaymentStatusMessage(null);
    void submitPayment();
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    void submitPayment();
  };


  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full text-center p-8 shadow-xl border-none rounded-2xl">
          <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Produto Indisponível</h1>
          <p className="text-slate-500 mt-3 text-sm">
            O link pode ter expirado ou o produto foi removido.
          </p>
          <Button className="mt-6 w-full h-11 rounded-xl font-bold bg-slate-900 hover:bg-black" asChild>
            <a href="/">Voltar ao início</a>
          </Button>
        </Card>
      </div>
    );
  }

  const accent = paymentMethod === "mpesa" ? "#E30613" : "#F97316";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100">
      <div className="mx-auto w-full max-w-[460px] px-3 py-4 sm:px-4 sm:py-6">
        {/* Top countdown banner — only rendered when the product has the timer enabled */}
        {product.timer_enabled !== false && (
          <div className="bg-gradient-to-r from-red-600 to-red-500 text-white rounded-2xl mb-3 px-3.5 py-2.5 flex items-center justify-center gap-2 shadow-[0_4px_14px_-2px_rgba(220,38,38,0.45)]">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide truncate">Essa oferta expira em</span>
            <span className="text-sm font-black tabular-nums bg-white/20 px-2.5 py-1 rounded-md animate-pulse flex-shrink-0">
              {formatTime(timeLeft)}
            </span>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.07)] border border-slate-200/60 overflow-hidden">
          {/* Header: product + price */}
          <div className="p-4 sm:p-5 flex gap-3 items-center border-b border-slate-100">
            <div className="h-14 w-14 sm:h-16 sm:w-16 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-slate-200/60">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="eager" decoding="async" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <Package className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-semibold text-slate-900 leading-tight truncate">{product.name}</h1>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                  {(Number(product.price) + (bumpAccepted && product.bump_enabled && product.bump_price ? Number(product.bump_price) : 0)).toLocaleString("pt-MZ")}
                </span>
                <span className="text-xs font-semibold text-slate-500">MT</span>
              </div>
            </div>
          </div>

          {/* Optional banner — image or video, depending on the product's configuration */}
          {product.checkout_banner_type === "video" && product.checkout_banner_video_url ? (
            <div className="px-4 sm:px-5 pt-3.5">
              <video
                src={product.checkout_banner_video_url}
                className="w-full h-auto rounded-xl border border-slate-100 bg-black"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            </div>
          ) : product.checkout_banner_url ? (
            <div className="px-4 sm:px-5 pt-3.5">
              <img
                src={product.checkout_banner_url}
                alt="Oferta"
                className="w-full h-auto rounded-xl object-cover border border-slate-100"
                loading="lazy"
                decoding="async"
              />
            </div>
          ) : null}

          <form onSubmit={handlePayment} className="p-4 sm:p-5 space-y-4">
            {/* Buyer info */}
            <div className="space-y-2">
              <Input
                placeholder="Nome completo"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 border-slate-200 rounded-xl bg-slate-50/50 text-sm font-medium placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:bg-white"
              />

              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  <span className="text-xs font-semibold text-slate-500">+258</span>
                </div>
                <Input
                  placeholder="WhatsApp (84xxxxxxx)"
                  inputMode="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(sanitizePhone(e.target.value))}
                  className="h-12 pl-[72px] border-slate-200 rounded-xl bg-slate-50/50 text-sm font-medium placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:bg-white"
                />
              </div>
            </div>

            {/* Method selector */}
            <div className="space-y-2 pt-1">
              <span className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                Método de Pagamento
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("mpesa"); setPhone(""); }}
                  className={cn(
                    "relative flex items-center gap-2 p-2.5 sm:p-3 rounded-xl border-2 transition-all bg-white",
                    paymentMethod === "mpesa"
                      ? "border-[#E30613] shadow-[0_0_0_3px_rgba(227,6,19,0.08)]"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0">
                    <img src="/mpesa-logo.jpg" className="h-full w-full object-cover" alt="M-Pesa" loading="lazy" />
                  </div>
                  <span className="text-sm font-bold text-slate-900">M-Pesa</span>
                  {paymentMethod === "mpesa" && (
                    <CheckCircle2 className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-[#E30613] fill-white" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod("emola"); setPhone(""); }}
                  className={cn(
                    "relative flex items-center gap-2 p-2.5 sm:p-3 rounded-xl border-2 transition-all bg-white",
                    paymentMethod === "emola"
                      ? "border-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.1)]"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0">
                    <img src="/emola-logo.jpg" className="h-full w-full object-cover" alt="e-Mola" loading="lazy" />
                  </div>
                  <span className="text-sm font-bold text-slate-900">e-Mola</span>
                  {paymentMethod === "emola" && (
                    <CheckCircle2 className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-orange-500 fill-white" />
                  )}
                </button>
              </div>
            </div>

            {/* Payment number */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                <img src={mozFlag.url} alt="MZ" className="h-3.5 w-5 object-cover rounded-sm" />
                <span className="text-xs font-semibold text-slate-500">+258</span>
              </div>
              <Input
                placeholder={paymentMethod === "mpesa" ? "Número M-Pesa (84/85)" : "Número e-Mola (86/87)"}
                required
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(sanitizePhone(e.target.value))}
                maxLength={9}

                className="h-12 pl-[72px] border-slate-200 rounded-xl bg-slate-50/50 text-sm font-medium placeholder:text-slate-400 focus-visible:ring-2 focus-visible:bg-white"
                style={{ ['--tw-ring-color' as any]: accent }}
              />
            </div>

            {/* Status / error */}
            {paymentErrorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-red-800 leading-snug">
                      {paymentErrorCode === "insufficient_balance"
                        ? "Saldo insuficiente na carteira"
                        : paymentErrorCode === "cancelled"
                          ? "Pagamento cancelado"
                          : paymentErrorCode === "timeout"
                            ? "PIN não confirmado a tempo"
                            : paymentErrorCode === "invalid_phone" ||
                                paymentErrorCode === "method_mismatch"
                              ? "Número inválido"
                              : "Pagamento não concluído"}
                    </p>
                    <p className="text-[11px] font-medium text-red-700 leading-snug mt-0.5">
                      {paymentErrorCode === "insufficient_balance"
                        ? "Recarrega a tua carteira e clica em Tentar novamente."
                        : paymentErrorCode === "cancelled"
                          ? "Cancelaste a confirmação. Podes tentar de novo agora."
                          : paymentErrorCode === "timeout"
                            ? "Tenta novamente e digita o PIN assim que receberes a notificação."
                            : paymentErrorMessage}
                    </p>
                  </div>
                </div>
                {paymentRetryable && (
                  <button
                    type="button"
                    onClick={() => void submitPayment()}
                    disabled={processingPayment}
                    className="w-full h-10 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 transition"
                  >
                    {processingPayment ? "A enviar..." : "Tentar novamente"}
                  </button>
                )}
              </div>
            ) : paymentStatusMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2.5 text-xs font-medium text-emerald-700">
                {paymentConfirmed ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                ) : (
                  <span className="relative flex h-3.5 w-3.5 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500" />
                  </span>
                )}
                <span>{paymentStatusMessage}</span>
              </div>
            ) : null}



            {/* Order Bump */}
            {product.bump_enabled && product.bump_price && Number(product.bump_price) > 0 && (
              <button
                type="button"
                onClick={() => setBumpAccepted((v) => !v)}
                className={cn(
                  "w-full text-left rounded-xl border-2 border-dashed p-3 transition-all flex gap-3 items-center",
                  bumpAccepted ? "bg-white shadow-md" : "bg-white/60 hover:bg-white",
                )}
                style={{
                  borderColor: product.bump_highlight_color || "#16a34a",
                }}
              >
                <div
                  className={cn(
                    "h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0",
                  )}
                  style={{
                    borderColor: product.bump_highlight_color || "#16a34a",
                    background: bumpAccepted ? (product.bump_highlight_color || "#16a34a") : "transparent",
                  }}
                >
                  {bumpAccepted && <CheckCircle2 className="h-4 w-4 text-white" />}
                </div>
                {product.bump_image_url && (
                  <img
                    src={product.bump_image_url}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[10px] font-black uppercase tracking-wide"
                    style={{ color: product.bump_highlight_color || "#16a34a" }}
                  >
                    {product.bump_button_text || "Oferta especial"}
                  </div>
                  <div className="text-sm font-bold text-slate-900 leading-tight truncate">
                    {product.bump_title || "Adicionar oferta"}
                  </div>
                  {product.bump_description && (
                    <div className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                      {product.bump_description}
                    </div>
                  )}
                  <div className="mt-0.5 text-xs font-black text-slate-900 tabular-nums">
                    + {Number(product.bump_price).toLocaleString("pt-MZ")} MT
                  </div>
                </div>
              </button>
            )}

            {/* Total a pagar (dinâmico) */}
            {(() => {
              const total =
                Number(product.price) +
                (bumpAccepted && product.bump_enabled && product.bump_price
                  ? Number(product.bump_price)
                  : 0);
              return (
                <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Total a pagar
                  </span>
                  <span className="text-lg font-black tabular-nums text-slate-900">
                    {total.toLocaleString("pt-MZ")} MT
                  </span>
                </div>
              );
            })()}

            {/* CTA */}
            <Button
              type="submit"
              disabled={processingPayment}
              className="w-full h-14 text-base font-black text-white rounded-xl shadow-lg disabled:opacity-70 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-1"
              style={{
                background: `linear-gradient(180deg, ${accent} 0%, ${paymentMethod === "mpesa" ? "#B30410" : "#EA580C"} 100%)`,
                boxShadow: `0 10px 25px -5px ${accent}50`,
              }}
            >
              {processingPayment ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Pagar {(Number(product.price) + (bumpAccepted && product.bump_enabled && product.bump_price ? Number(product.bump_price) : 0)).toLocaleString("pt-MZ")} MT
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <div className="flex items-center justify-center gap-1.5 pt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
              <span className="text-[11px] font-medium text-slate-500">
                Pagamento 100% seguro via M-Pesa e e-Mola
              </span>
            </div>

          </form>
        </div>
      </div>

      <Dialog open={failureModalOpen} onOpenChange={setFailureModalOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="mx-auto h-14 w-14 rounded-full bg-red-50 flex items-center justify-center mb-2 animate-pulse">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <DialogTitle className="text-center text-lg font-bold text-slate-900">
              {paymentErrorCode === "timeout"
                ? "⏰ O PIN não foi confirmado a tempo"
                : paymentErrorCode === "cancelled"
                  ? "😕 Quase lá! Pagamento cancelado"
                  : paymentErrorCode === "insufficient_balance"
                    ? "💳 Saldo insuficiente"
                    : "⚠️ A tua compra ainda não foi concluída"}
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-slate-600 pt-1 space-y-2">
              <span className="block">
                {paymentErrorCode === "timeout"
                  ? "Não conseguimos confirmar o teu PIN a tempo. Isto acontece — tenta de novo e digita o PIN assim que receberes a notificação da operadora."
                  : paymentErrorCode === "cancelled"
                    ? "Cancelaste o pedido por engano? Não percas esta oferta — clica abaixo e finaliza em segundos."
                    : paymentErrorCode === "insufficient_balance"
                      ? "Recarrega a tua carteira e volta já — a tua oferta ainda está reservada por poucos minutos."
                      : "Tenta novamente agora para garantir o teu acesso antes que a oferta expire."}
              </span>
              <span className="block text-[11px] font-semibold text-red-600">
                🔥 Esta oferta exclusiva expira em poucos minutos
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              onClick={retryPayment}
              disabled={processingPayment}
              className="w-full h-12 rounded-xl font-bold text-white shadow-lg"
              style={{
                background: `linear-gradient(180deg, ${accent} 0%, ${paymentMethod === "mpesa" ? "#B30410" : "#EA580C"} 100%)`,
              }}
            >
              {processingPayment ? "A enviar..." : "✅ Tentar Novamente Agora"}
            </Button>
            <button
              type="button"
              onClick={() => setFailureModalOpen(false)}
              className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 py-1"
            >
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
