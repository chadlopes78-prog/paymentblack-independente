import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Webhook, Plus, Pencil, Trash2, Send, History, CheckCircle2, XCircle, Clock, Package } from "lucide-react";
import { WEBHOOK_EVENTS, type WebhookEventId } from "@/lib/webhooks/events";
import { upsertWebhook, deleteWebhook, testWebhook } from "@/lib/api/webhooks.functions";

interface Endpoint {
  id: string;
  name: string;
  url: string;
  secret?: string | null;
  events: string[];
  product_ids: string[];
  is_pushcut: boolean;
  active: boolean;
}

interface Delivery {
  id: string;
  webhook_id: string;
  event: string;
  status: string;
  attempts: number;
  response_code: number | null;
  error: string | null;
  payload: any;
  created_at: string;
}

interface Product { id: string; name: string }

export function WebhooksSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [open, setOpen] = useState(false);

  const upsert = useServerFn(upsertWebhook);
  const del = useServerFn(deleteWebhook);
  const test = useServerFn(testWebhook);

  const { data: products } = useQuery({
    queryKey: ["webhook-products"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return [] as Product[];
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("user_id", uid)
        .order("name");
      if (error) throw error;
      // Deduplicate by id defensively in case of duplicate rows in cache
      const seen = new Set<string>();
      const unique: Product[] = [];
      for (const p of (data ?? []) as Product[]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        unique.push(p);
      }
      return unique;
    },
  });

  const { data: hooks } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("id, name, url, active, is_pushcut, events, product_ids, user_id, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Endpoint[];
    },
  });

  const { data: deliveries } = useQuery({
    queryKey: ["webhook-deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("id, webhook_id, event, status, attempts, response_code, error, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
    refetchInterval: 10_000,
  });

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    (products ?? []).forEach((p) => m.set(p.id, p.name));
    return m;
  }, [products]);

  const removeMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["webhook-deliveries"] });
      toast.success("Teste enviado — veja o histórico abaixo");
      return res;
    },
    onError: (e: any) => toast.error("Falha no teste: " + e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <CardTitle>Webhooks e Eventos</CardTitle>
            </div>
            <CardDescription>
              Automações por produto e evento. Compatível com Pushcut, Zapier, Make, n8n e CRMs.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4" /> Novo
              </Button>
            </DialogTrigger>
            <EndpointDialog
              key={editing?.id ?? "new"}
              initial={editing}
              products={products ?? []}
              onSave={async (payload) => {
                await upsert({ data: payload });
                qc.invalidateQueries({ queryKey: ["webhooks"] });
                toast.success("Configurações guardadas com sucesso.");
                setOpen(false); setEditing(null);
              }}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          {(hooks ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Nenhum webhook configurado ainda. Clique em "Novo" para começar.
            </p>
          )}
          {(hooks ?? []).map((h) => {
            const scope = h.product_ids?.length
              ? `${h.product_ids.length} produto(s)`
              : "Todos os produtos";
            return (
              <div key={h.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{h.name}</span>
                    {h.is_pushcut && <Badge variant="secondary">Pushcut</Badge>}
                    {!h.active && <Badge variant="outline">Inativo</Badge>}
                    <Badge variant="outline" className="text-xs">{h.events.length} evento(s)</Badge>
                    <Badge variant="outline" className="text-xs gap-1">
                      <Package className="h-3 w-3" />{scope}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">{h.url}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" title="Testar"
                    onClick={() => testMut.mutate(h.id)} disabled={testMut.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Editar"
                    onClick={() => { setEditing(h); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Remover"
                    onClick={() => { if (confirm("Remover este webhook?")) removeMut.mutate(h.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Histórico de envios</h3>
          </div>
          <div className="rounded border p-2 space-y-1">
            {(deliveries ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground italic p-2">Sem envios ainda.</p>
            )}
            {(deliveries ?? []).slice(0, 20).map((d) => {
              const pid = (d.payload as any)?.product_id;
              const productName = pid ? productNameById.get(pid) : null;
              return (
                <div key={d.id} className="flex items-center gap-2 text-xs p-2 rounded border bg-card flex-wrap">
                  <StatusIcon status={d.status} />
                  <span className="font-mono">{d.event}</span>
                  {productName && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Package className="h-3 w-3" />{productName}
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {new Date(d.created_at).toLocaleString("pt-PT")}
                  </span>
                  {d.response_code != null && (
                    <Badge variant="outline">HTTP {d.response_code}</Badge>
                  )}
                  {d.attempts > 1 && <span className="text-amber-600">×{d.attempts}</span>}
                  {d.error && <span className="text-destructive truncate max-w-full">{d.error}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

interface DialogProps {
  initial: Endpoint | null;
  products: Product[];
  onSave: (payload: {
    id?: string; name: string; url: string; secret: string | null;
    events: string[]; product_ids: string[]; is_pushcut: boolean; active: boolean;
  }) => Promise<void>;
}

function isValidHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function EndpointDialog({ initial, products, onSave }: DialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [secret, setSecret] = useState(initial?.secret ?? "");
  const [isPushcut, setIsPushcut] = useState(initial?.is_pushcut ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [events, setEvents] = useState<string[]>(initial?.events ?? ["sale.approved"]);
  const [scope, setScope] = useState<"all" | "specific">(
    initial && initial.product_ids?.length ? "specific" : "all"
  );
  const [productIds, setProductIds] = useState<string[]>(initial?.product_ids ?? []);
  const [saving, setSaving] = useState(false);

  const toggleEvent = (id: WebhookEventId) =>
    setEvents((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);

  const toggleProduct = (id: string) =>
    setProductIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  const urlError = url && !isValidHttpUrl(url) ? "URL inválida (use https://...)" : null;
  const canSave = name.trim() && isValidHttpUrl(url) && events.length > 0
    && (scope === "all" || productIds.length > 0);

  return (
    <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
      <DialogHeader className="px-6 pt-6 pb-2">
        <DialogTitle>{initial ? "Editar Webhook" : "Novo Webhook"}</DialogTitle>
        <DialogDescription>
          Endpoint HTTPS que receberá os eventos. Use modo Pushcut para notificações no iPhone.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6">
        <div className="space-y-4 py-2 pb-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meu CRM" />
          </div>
          <div className="space-y-2">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.pushcut.io/.../notifications/..."
              className={urlError ? "border-destructive" : ""} />
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <div className="space-y-0.5">
              <Label className="font-semibold">Modo Pushcut</Label>
              <p className="text-xs text-muted-foreground">Formata payload como notificação Pushcut.</p>
            </div>
            <Switch checked={isPushcut} onCheckedChange={setIsPushcut} />
          </div>
          {!isPushcut && (
            <div className="space-y-2">
              <Label>Secret (opcional)</Label>
              <Input value={secret} onChange={(e) => setSecret(e.target.value)}
                placeholder="Enviado no header X-Webhook-Secret" />
            </div>
          )}
          <div className="flex items-center justify-between rounded border p-3">
            <Label className="font-semibold">Ativo</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div className="space-y-2">
            <Label>Produtos</Label>
            <div className="flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant={scope === "all" ? "default" : "outline"}
                onClick={() => setScope("all")}>Todos os produtos</Button>
              <Button type="button" size="sm" variant={scope === "specific" ? "default" : "outline"}
                onClick={() => setScope("specific")}>Produtos específicos</Button>
            </div>
            {scope === "specific" && (
              <div className="rounded border p-2 space-y-1">
                {products.length === 0 && (
                  <p className="text-xs text-muted-foreground italic p-2">Nenhum produto cadastrado.</p>
                )}
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer p-1">
                    <Checkbox checked={productIds.includes(p.id)}
                      onCheckedChange={() => toggleProduct(p.id)} />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Eventos</Label>
            <div className="grid grid-cols-1 gap-2 rounded border p-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev.id} className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={events.includes(ev.id)}
                    onCheckedChange={() => toggleEvent(ev.id)} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{ev.label}</span>
                    <span className="block text-xs text-muted-foreground">{ev.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="px-6 py-4 border-t">
        <Button
          disabled={saving || !canSave}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                id: initial?.id, name: name.trim(), url: url.trim(),
                secret: secret.trim() || null,
                events,
                product_ids: scope === "all" ? [] : productIds,
                is_pushcut: isPushcut, active,
              });
            } catch (e: any) {
              toast.error(e.message || "Erro ao salvar");
            } finally { setSaving(false); }
          }}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
