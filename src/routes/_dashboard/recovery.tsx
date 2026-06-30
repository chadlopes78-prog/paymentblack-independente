import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, MessageCircle, CheckCircle2, Clock, TrendingUp, Search, Trash2, Send, Pencil, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { logRecoveryAttempt, resetRecoveryHistory } from "@/lib/api/recovery.functions";

export const Route = createFileRoute("/_dashboard/recovery")({
  component: RecoveryPage,
});

const RESET_STORAGE_KEY = "recovery:reset_at";
const TEMPLATE_STORAGE_KEY = "recovery:message_template";
type Period = "today" | "7d" | "30d" | "custom";

const SUCCESS_STATUSES = ["approved", "paid", "success"];
const ABANDONED_WINDOW_DAYS = 30;
const EXPIRE_AFTER_HOURS = 24;

const DEFAULT_TEMPLATE = `👋 Olá, {nome}!

Percebemos que você iniciou sua compra do produto *{produto}*, mas ela não foi finalizada.

A boa notícia é que seu pedido ainda está reservado, e você pode concluir tudo em menos de 1 minuto.

✅ Basta clicar no link abaixo para continuar exatamente de onde parou:

{link}

Valor: {valor} MZN

Se tiver qualquer dúvida, basta responder esta mensagem. Estamos prontos para ajudar. 😊`;

function renderTemplate(
  template: string,
  vars: { nome: string; produto: string; valor: string; link: string },
) {
  return template
    .replace(/\{nome\}/gi, vars.nome)
    .replace(/\{produto\}/gi, vars.produto)
    .replace(/\{valor\}/gi, vars.valor)
    .replace(/\{link\}/gi, vars.link);
}

type SaleRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  amount: number | string | null;
  status: string | null;
  created_at: string;
  product_id: string | null;
  bump_amount: number | string | null;
  bump_accepted: boolean | null;
  products?: { id: string; name: string | null; custom_url: string | null } | null;
};

type RecoveryItem = {
  key: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  productId: string | null;
  productLinkId: string | null;
  amount: number;
  lastAttemptAt: string;
  status: "pending" | "expired" | "recovered";
  recoveredAt: string | null;
  contactSent: boolean;
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("258")) return digits;
  if (digits.length === 9) return `258${digits}`;
  return digits;
}

function formatPhoneDisplay(phone: string) {
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("258") ? d.slice(3) : d;
  if (local.length === 9) return `+258 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  return phone;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora mesmo";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

function RecoveryPage() {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [templateDraft, setTemplateDraft] = useState<string>(DEFAULT_TEMPLATE);
  const [templateOpen, setTemplateOpen] = useState(false);
  const logAttempt = useServerFn(logRecoveryAttempt);
  const resetHistory = useServerFn(resetRecoveryHistory);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setResetAt(window.localStorage.getItem(RESET_STORAGE_KEY));
      const saved = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (saved && saved.trim()) {
        setMessageTemplate(saved);
        setTemplateDraft(saved);
      }
    }
  }, []);

  const periodRange = useMemo(() => {
    const now = new Date();
    if (period === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: now };
    }
    if (period === "7d") {
      return { from: new Date(now.getTime() - 7 * 86400_000), to: now };
    }
    if (period === "30d") {
      return { from: new Date(now.getTime() - 30 * 86400_000), to: now };
    }
    // custom
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(now.getTime() - 30 * 86400_000);
    const to = customTo ? new Date(`${customTo}T23:59:59`) : now;
    return { from, to };
  }, [period, customFrom, customTo]);


  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["recovery-sales"],
    queryFn: async () => {
      const since = new Date(Date.now() - ABANDONED_WINDOW_DAYS * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("sales")
        .select("id, customer_name, customer_phone, amount, status, created_at, product_id, bump_amount, bump_accepted, products(id, name, custom_url)")
        .gte("created_at", since)
        .not("customer_phone", "is", null)
        .not("customer_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
    refetchInterval: 30_000,
  });

  const { data: attempts = [], refetch: refetchAttempts } = useQuery({
    queryKey: ["recovery-attempts"],
    queryFn: async () => {
      const since = new Date(Date.now() - ABANDONED_WINDOW_DAYS * 86400_000).toISOString();
      const { data, error } = await (supabase.from as any)("recovery_attempts")
        .select("product_id, customer_phone, sent_at")
        .gte("sent_at", since)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string | null; customer_phone: string; sent_at: string }>;
    },
    refetchInterval: 30_000,
  });

  const attemptKey = (phone: string, productId: string | null | undefined) =>
    `${normalizePhone(phone)}::${productId ?? ""}`;

  const firstAttemptByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of attempts) {
      const k = attemptKey(a.customer_phone, a.product_id);
      if (!m.has(k)) m.set(k, a.sent_at);
    }
    return m;
  }, [attempts]);

  const items: RecoveryItem[] = useMemo(() => {
    const groups = new Map<string, SaleRow[]>();
    for (const s of sales) {
      const phone = (s.customer_phone ?? "").trim();
      if (!phone) continue;
      const key = `${normalizePhone(phone)}::${s.product_id ?? ""}`;
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }

    const out: RecoveryItem[] = [];
    for (const [key, rows] of groups) {
      rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      const abandoned = rows.filter((r) => !SUCCESS_STATUSES.includes((r.status ?? "").toLowerCase()));
      if (abandoned.length === 0) continue; // only show real abandoned checkouts
      const latestAbandoned = abandoned[0];
      const reference = latestAbandoned;
      const amount = Number(reference.amount ?? 0) + (reference.bump_accepted ? Number(reference.bump_amount ?? 0) : 0);

      // Recovery only counts when a recovery attempt was logged AND a paid sale exists after it
      const attemptAt = firstAttemptByKey.get(key);
      let status: RecoveryItem["status"];
      let recoveredAt: string | null = null;
      if (attemptAt) {
        const paidAfter = rows.find(
          (r) =>
            SUCCESS_STATUSES.includes((r.status ?? "").toLowerCase()) &&
            new Date(r.created_at) >= new Date(attemptAt),
        );
        if (paidAfter) {
          status = "recovered";
          recoveredAt = paidAfter.created_at;
        } else {
          const ageH = (Date.now() - new Date(latestAbandoned.created_at).getTime()) / 3600_000;
          status = ageH > EXPIRE_AFTER_HOURS ? "expired" : "pending";
        }
      } else {
        const ageH = (Date.now() - new Date(latestAbandoned.created_at).getTime()) / 3600_000;
        status = ageH > EXPIRE_AFTER_HOURS ? "expired" : "pending";
      }

      out.push({
        key,
        customerName: reference.customer_name ?? "Cliente",
        customerPhone: reference.customer_phone ?? "",
        productName: reference.products?.name ?? "Produto",
        productId: reference.product_id ?? reference.products?.id ?? null,
        productLinkId: reference.products?.custom_url || reference.products?.id || reference.product_id,
        amount,
        lastAttemptAt: reference.created_at,
        status,
        recoveredAt,
        contactSent: Boolean(attemptAt),
      });
    }
    out.sort((a, b) => +new Date(b.lastAttemptAt) - +new Date(a.lastAttemptAt));
    return out;
  }, [sales, firstAttemptByKey]);

  const periodItems = useMemo(() => {
    const resetTs = resetAt ? +new Date(resetAt) : 0;
    const fromTs = +periodRange.from;
    const toTs = +periodRange.to;
    return items.filter((i) => {
      const t = +new Date(i.lastAttemptAt);
      if (t < resetTs) return false;
      return t >= fromTs && t <= toTs;
    });
  }, [items, periodRange, resetAt]);

  const filtered = periodItems.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.customerName.toLowerCase().includes(q) ||
      i.customerPhone.includes(q) ||
      i.productName.toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    const abandoned = periodItems.filter((i) => i.status === "pending" || i.status === "expired");
    const recovered = periodItems.filter((i) => i.status === "recovered");
    const recoveredValue = recovered.reduce((sum, i) => sum + i.amount, 0);
    const total = abandoned.length + recovered.length;
    const rate = total > 0 ? (recovered.length / total) * 100 : 0;
    return {
      abandonedCount: abandoned.length,
      recoveredCount: recovered.length,
      recoveredValue,
      rate,
    };
  }, [periodItems]);

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetHistory();
      const now = new Date().toISOString();
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RESET_STORAGE_KEY, now);
      }
      setResetAt(now);
      await refetchAttempts();
      toast.success("Histórico de recuperação resetado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao resetar histórico.");
    } finally {
      setResetting(false);
    }
  };

  const buildWhatsAppLink = (item: RecoveryItem) => {
    const phone = normalizePhone(item.customerPhone);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const checkoutLink = item.productLinkId ? `${origin}/p/${item.productLinkId}` : origin;
    const message = renderTemplate(messageTemplate, {
      nome: item.customerName,
      produto: item.productName,
      valor: item.amount.toFixed(2),
      link: checkoutLink,
    });
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const handleSaveTemplate = () => {
    const value = templateDraft.trim() ? templateDraft : DEFAULT_TEMPLATE;
    setMessageTemplate(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, value);
    }
    setTemplateOpen(false);
    toast.success("Mensagem de recuperação atualizada.");
  };

  const handleResetTemplate = () => {
    setTemplateDraft(DEFAULT_TEMPLATE);
  };

  const templatePreview = useMemo(
    () =>
      renderTemplate(templateDraft || DEFAULT_TEMPLATE, {
        nome: "Maria",
        produto: "Curso Premium",
        valor: "1500.00",
        link: "https://seusite.com/p/curso",
      }),
    [templateDraft],
  );

  const pendingToSend = useMemo(
    () => periodItems.filter((i) => i.status === "pending" && !i.contactSent),
    [periodItems],
  );

  const isValidMozPhone = (raw: string) => {
    const digits = (raw ?? "").replace(/\D/g, "");
    const local = digits.startsWith("258") ? digits.slice(3) : digits;
    // Mobile MZ: 9 digits starting with 8, valid second digit 2-7
    return local.length === 9 && /^8[2-7]\d{7}$/.test(local);
  };

  const handleSendAll = async () => {
    if (sendingBulk) return;
    const targets = pendingToSend;
    if (targets.length === 0) {
      toast.info("Nenhum checkout pendente para contactar.");
      return;
    }
    setSendingBulk(true);
    let sent = 0;
    let failed = 0;
    let ignored = 0;
    let popupBlocked = false;
    const sendLog: Array<{ name: string; phone: string; status: "Enviado" | "Falhou" | "Ignorado"; reason?: string }> = [];
    toast.info(`Enviando ${targets.length} mensagem(ns)... mantenha esta aba aberta.`);

    for (const item of targets) {
      // 1) Ignore invalid / empty numbers — never break the loop
      if (!item.customerPhone?.trim() || !isValidMozPhone(item.customerPhone)) {
        ignored++;
        sendLog.push({
          name: item.customerName,
          phone: item.customerPhone || "(vazio)",
          status: "Ignorado",
          reason: "Número inválido ou sem WhatsApp",
        });
        console.warn(`[Recovery] Ignorado: ${item.customerName} (${item.customerPhone || "vazio"}) — número inválido`);
        continue;
      }

      // 2) Try to open WhatsApp + log attempt; isolate failures per contact
      try {
        const url = buildWhatsAppLink(item);
        let opened: Window | null = null;
        try {
          opened = window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          opened = null;
        }
        if (!opened) {
          popupBlocked = true;
          failed++;
          sendLog.push({
            name: item.customerName,
            phone: item.customerPhone,
            status: "Falhou",
            reason: "Pop-up bloqueado pelo navegador",
          });
          console.warn(`[Recovery] Falhou (pop-up): ${item.customerName} (${item.customerPhone})`);
          continue; // keep going — do not stop the queue
        }

        try {
          await logAttempt({
            data: { productId: item.productId, customerPhone: item.customerPhone },
          });
        } catch (logErr) {
          // Attempt registration failed but WhatsApp opened — count as sent, log warning
          console.warn(`[Recovery] Falha ao registrar tentativa de ${item.customerName}:`, logErr);
        }

        sent++;
        sendLog.push({ name: item.customerName, phone: item.customerPhone, status: "Enviado" });
        console.info(`[Recovery] Enviado: ${item.customerName} (${item.customerPhone})`);
      } catch (err) {
        failed++;
        sendLog.push({
          name: item.customerName,
          phone: item.customerPhone,
          status: "Falhou",
          reason: (err as Error)?.message ?? "Erro desconhecido",
        });
        console.error(`[Recovery] Falhou: ${item.customerName} (${item.customerPhone})`, err);
      }

      // Throttle between sends — also wrapped so a timer hiccup can never stop us
      try {
        await new Promise((r) => setTimeout(r, 600));
      } catch {
        /* noop */
      }
    }

    console.table(sendLog);
    await refetchAttempts().catch(() => {});
    setSendingBulk(false);

    const parts: string[] = [];
    if (sent > 0) parts.push(`${sent} enviada(s)`);
    if (failed > 0) parts.push(`${failed} falhou(aram)`);
    if (ignored > 0) parts.push(`${ignored} ignorada(s)`);
    const summary = parts.join(" · ") || "Nenhum envio processado.";

    if (sent > 0) toast.success(`Processo concluído: ${summary}`);
    else if (ignored > 0 && failed === 0) toast.warning(`Processo concluído: ${summary}`);
    else toast.error(`Processo concluído: ${summary}`);

    if (popupBlocked) {
      toast.error("Algumas abas foram bloqueadas. Permita pop-ups para esta página e tente novamente.");
    }
  };

  const periodLabel =
    period === "today" ? "Hoje" :
    period === "7d" ? "Últimos 7 dias" :
    period === "30d" ? "Últimos 30 dias" :
    customFrom && customTo ? `${customFrom} → ${customTo}` : "Personalizado";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recuperação de Vendas</h1>
          <p className="text-muted-foreground">Recupere vendas perdidas enviando o link do checkout direto pelo WhatsApp.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[150px]" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[150px]" />
            </>
          )}
          <Button
            size="sm"
            onClick={handleSendAll}
            disabled={sendingBulk || pendingToSend.length === 0}
            className="bg-[#25D366] hover:bg-[#1DAE54] text-white"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sendingBulk ? "Enviando..." : `Enviar para Todos os Pendentes${pendingToSend.length ? ` (${pendingToSend.length})` : ""}`}
          </Button>
          <Dialog
            open={templateOpen}
            onOpenChange={(o) => {
              setTemplateOpen(o);
              if (o) setTemplateDraft(messageTemplate);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-1.5" />
                Personalizar Mensagem
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Mensagem de Recuperação no WhatsApp</DialogTitle>
                <DialogDescription>
                  Personalize a mensagem enviada ao clicar em "Recuperar Venda". Use as variáveis abaixo — serão substituídas automaticamente para cada cliente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{"{nome}"} — nome do cliente</Badge>
                  <Badge variant="secondary">{"{produto}"} — nome do produto</Badge>
                  <Badge variant="secondary">{"{valor}"} — valor em MZN</Badge>
                  <Badge variant="secondary">{"{link}"} — link do checkout</Badge>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recovery-template">Mensagem</Label>
                  <Textarea
                    id="recovery-template"
                    value={templateDraft}
                    onChange={(e) => setTemplateDraft(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pré-visualização</Label>
                  <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {templatePreview}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="ghost" onClick={handleResetTemplate}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Restaurar padrão
                </Button>
                <Button type="button" variant="outline" onClick={() => setTemplateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSaveTemplate}>
                  Salvar mensagem
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={resetting}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Resetar Dados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resetar histórico de recuperação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso apaga todas as tentativas de recuperação registradas e oculta os checkouts abandonados anteriores desta aba. As vendas e transações reais permanecem intactas. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} disabled={resetting}>
                  {resetting ? "Resetando..." : "Sim, resetar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Clock} label="Checkouts Abandonados" value={String(stats.abandonedCount)} tone="amber" />
        <StatCard icon={CheckCircle2} label="Vendas Recuperadas" value={String(stats.recoveredCount)} tone="green" />
        <StatCard icon={TrendingUp} label="Valor Recuperado" value={`${stats.recoveredValue.toFixed(2)} MZN`} tone="blue" />
        <StatCard icon={TrendingUp} label="Taxa de Recuperação" value={`${stats.rate.toFixed(1)}%`} tone="violet" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Checkouts Abandonados & Recuperados</CardTitle>
              <CardDescription>Período: {periodLabel}.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar nome, telefone, produto"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum checkout abandonado por aqui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Tentativa</TableHead>
                    <TableHead>Tempo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="font-medium">{item.customerName}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatPhoneDisplay(item.customerPhone)}</TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.amount.toFixed(2)} MZN</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(item.lastAttemptAt).toLocaleString("pt-PT")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{timeAgo(item.lastAttemptAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} contactSent={item.contactSent} />
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === "recovered" ? (
                          <span className="text-xs text-green-600 font-medium">Concluída</span>
                        ) : (
                          <Button
                            asChild
                            size="sm"
                            className="bg-[#25D366] hover:bg-[#1DAE54] text-white"
                          >
                            <a
                              href={buildWhatsAppLink(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                logAttempt({
                                  data: {
                                    productId: item.productId,
                                    customerPhone: item.customerPhone,
                                  },
                                }).then(() => refetchAttempts()).catch(() => {});
                              }}
                            >
                              <MessageCircle className="h-4 w-4 mr-1.5" />
                              Recuperar Venda
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone: "amber" | "green" | "blue" | "violet";
}) {
  const tones: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    green: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, contactSent }: { status: RecoveryItem["status"]; contactSent?: boolean }) {
  if (status === "recovered")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Recuperado</Badge>;
  if (status === "expired")
    return <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200">Expirado</Badge>;
  if (contactSent)
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Contato Enviado</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pendente</Badge>;
}
