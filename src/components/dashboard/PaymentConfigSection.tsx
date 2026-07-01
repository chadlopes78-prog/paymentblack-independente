/**
 * Per-user payment processing configuration.
 * Rendered inside the "Conta de Recebimento" settings card.
 *
 * Section 1 — Processamento por Documento
 * Section 2 — Integração com Carteira (E2Payments)
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Upload, Trash2, RefreshCw, CheckCircle2, XCircle,
  Clock, Wifi, WifiOff, Loader2, ChevronDown, ChevronUp, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function callConfigApi(action: string, extra: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Não autenticado.");

  const res = await fetch("/.netlify/functions/api-payment-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Erro desconhecido.");
  return json;
}

async function callTestApi() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Não autenticado.");

  const res = await fetch("/.netlify/functions/api-payment-test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: "{}",
  });
  return res.json();
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-MZ", { dateStyle: "short", timeStyle: "short" });
}

function fmtBytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── main component ───────────────────────────────────────────────────────────

export function PaymentConfigSection() {
  const qc = useQueryClient();

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["user_payment_config"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("user_payment_configs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as any;
    },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ["user_payment_config"] });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações...
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <DocSection cfg={cfg} refetch={refetch} />
      <div className="h-px bg-slate-100" />
      <E2pSection cfg={cfg} refetch={refetch} />
    </div>
  );
}

// ─── Section 1: Document ──────────────────────────────────────────────────────

function DocSection({ cfg, refetch }: { cfg: any; refetch: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const hasDoc = !!cfg?.doc_file_url;
  const docEnabled: boolean = cfg?.doc_enabled ?? false;

  async function handleUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");

      // Upload to Supabase Storage
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/payment-configs/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      const fileUrl = urlData.publicUrl;

      // Try to read content for parsing (JSON documents only)
      let fileContent: string | undefined;
      if (file.type === "application/json" || file.name.endsWith(".json")) {
        fileContent = await file.text();
      }

      const result = await callConfigApi("save_doc", {
        fileUrl,
        fileName: file.name,
        fileSize: file.size,
        fileContent,
      });

      if (result.parsed) {
        toast.success("Documento enviado e credenciais extraídas com sucesso!");
      } else {
        toast.success("Documento salvo. Nenhuma credencial foi extraída automaticamente.");
      }
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar documento.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await callConfigApi("remove_doc");
      toast.success("Documento removido.");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRemoving(false);
    }
  }

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => callConfigApi("toggle_doc", { enabled }),
    onSuccess: (_, enabled) => {
      toast.success(enabled ? "Processamento por Documento ativado." : "Processamento por Documento desativado.");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-slate-800">Processamento por Documento</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Envie um documento de configuração fornecido pelo seu provedor de pagamentos.
            </p>
          </div>
        </div>
        {hasDoc && (
          <Switch
            checked={docEnabled}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
          />
        )}
      </div>

      {/* Status card */}
      {hasDoc ? (
        <div className="rounded-xl border bg-slate-50/60 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">
                  {cfg.doc_file_name || "Documento configurado"}
                </p>
                {cfg.doc_file_size && (
                  <span className="text-[10px] text-slate-400">{fmtBytes(cfg.doc_file_size)}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 pl-6">
                Última configuração: {fmtDate(cfg.doc_parsed_at || cfg.updated_at)}
              </p>
              {cfg.doc_credentials && (
                <p className="text-[11px] text-emerald-600 pl-6 font-medium">
                  ✓ Credenciais extraídas automaticamente
                </p>
              )}
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-bold shrink-0",
                docEnabled
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-slate-100 border-slate-200 text-slate-500",
              )}
            >
              {docEnabled ? "Ativo" : "Inativo"}
            </Badge>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || removing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", uploading && "animate-spin")} />
              Substituir Documento
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8 text-red-600 hover:text-red-700 hover:border-red-200"
              onClick={handleRemove}
              disabled={removing || uploading}
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remover Documento
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <p className="text-sm text-slate-500">Enviando documento...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Clique para enviar documento</p>
              <p className="text-[11px] text-slate-400">JSON, TXT ou outros formatos fornecidos pelo provedor</p>
            </div>
          )}
        </div>
      )}

      {/* Botão Enviar Documento (quando não há doc) */}
      {!hasDoc && (
        <Button
          size="sm"
          className="gap-2 text-xs h-8"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Enviando..." : "Enviar Documento"}
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,.cfg,.conf,.yaml,.yml,application/json,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />
    </div>
  );
}

// ─── Section 2: E2Payments ────────────────────────────────────────────────────

function E2pSection({ cfg, refetch }: { cfg: any; refetch: () => void }) {
  const [open, setOpen] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const [mpesaClientId, setMpesaClientId] = useState(cfg?.e2p_mpesa_client_id || "");
  const [mpesaClientSecret, setMpesaClientSecret] = useState(cfg?.e2p_mpesa_client_secret || "");
  const [mpesaWallet, setMpesaWallet] = useState(cfg?.e2p_mpesa_wallet || "");
  const [emolaClientId, setEmolaClientId] = useState(cfg?.e2p_emola_client_id || "");
  const [emolaClientSecret, setEmolaClientSecret] = useState(cfg?.e2p_emola_client_secret || "");
  const [emolaWallet, setEmolaWallet] = useState(cfg?.e2p_emola_wallet || "");

  const hasCredentials = !!(cfg?.e2p_mpesa_client_id || cfg?.e2p_emola_client_id);
  const e2pEnabled: boolean = cfg?.e2p_enabled ?? false;
  const connStatus: string = cfg?.e2p_connection_status || "untested";

  const saveMutation = useMutation({
    mutationFn: () =>
      callConfigApi("save_e2p", {
        mpesa: { clientId: mpesaClientId.trim(), clientSecret: mpesaClientSecret.trim(), wallet: mpesaWallet.trim() },
        emola: { clientId: emolaClientId.trim(), clientSecret: emolaClientSecret.trim(), wallet: emolaWallet.trim() },
      }),
    onSuccess: () => {
      toast.success("Credenciais E2Payments salvas.");
      refetch();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testing, setTesting] = useState(false);
  async function handleTest() {
    setTesting(true);
    try {
      const res = await callTestApi();
      if (res.status === "connected") {
        toast.success("Conexão bem-sucedida! Credenciais válidas.");
      } else {
        toast.error("Falha na conexão: " + (res.error || "credenciais inválidas."));
      }
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  }

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => callConfigApi("toggle_e2p", { enabled }),
    onSuccess: (_, enabled) => {
      toast.success(enabled ? "Integração E2Payments ativada." : "Integração E2Payments desativada.");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusIcon = {
    connected: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    failed:    <XCircle className="h-4 w-4 text-red-500" />,
    untested:  <Clock className="h-4 w-4 text-slate-400" />,
  }[connStatus] ?? <Clock className="h-4 w-4 text-slate-400" />;

  const statusLabel = {
    connected: "Conectado",
    failed:    "Falhou",
    untested:  "Não testado",
  }[connStatus] ?? "Desconhecido";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-violet-50 border border-violet-100">
            <Wifi className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-slate-800">Integração com Carteira (E2Payments)</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Configure manualmente as credenciais da sua carteira M-Pesa e e-Mola.
            </p>
          </div>
        </div>
        {hasCredentials && (
          <Switch
            checked={e2pEnabled}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
          />
        )}
      </div>

      {/* Status row */}
      {hasCredentials && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-slate-50/60">
          <div className="flex items-center gap-1.5">
            {statusIcon}
            <span className="text-xs font-medium text-slate-700">{statusLabel}</span>
          </div>
          {cfg?.e2p_last_tested_at && (
            <span className="text-[10px] text-slate-400">
              Último teste: {fmtDate(cfg.e2p_last_tested_at)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-bold",
                e2pEnabled
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : "bg-slate-100 border-slate-200 text-slate-500",
              )}
            >
              {e2pEnabled ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        </div>
      )}

      {/* Expand/collapse credentials form */}
      <button
        type="button"
        className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {hasCredentials ? "Editar credenciais" : "Configurar credenciais"}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campos</p>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
              onClick={() => setShowSecrets((v) => !v)}
            >
              {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showSecrets ? "Ocultar segredos" : "Mostrar segredos"}
            </button>
          </div>

          {/* M-Pesa */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              M-Pesa
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Client ID</Label>
                <Input
                  value={mpesaClientId}
                  onChange={(e) => setMpesaClientId(e.target.value)}
                  placeholder="client_id"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Client Secret</Label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={mpesaClientSecret}
                  onChange={(e) => setMpesaClientSecret(e.target.value)}
                  placeholder="••••••••"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] text-slate-500">Número da Carteira M-Pesa</Label>
                <Input
                  value={mpesaWallet}
                  onChange={(e) => setMpesaWallet(e.target.value)}
                  placeholder="84xxxxxxx ou 258 84xxxxxxx"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          {/* e-Mola */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
              e-Mola
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Client ID</Label>
                <Input
                  value={emolaClientId}
                  onChange={(e) => setEmolaClientId(e.target.value)}
                  placeholder="client_id"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Client Secret</Label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={emolaClientSecret}
                  onChange={(e) => setEmolaClientSecret(e.target.value)}
                  placeholder="••••••••"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] text-slate-500">Número da Carteira e-Mola</Label>
                <Input
                  value={emolaWallet}
                  onChange={(e) => setEmolaWallet(e.target.value)}
                  placeholder="86xxxxxxx ou 258 86xxxxxxx"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap pt-1">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar Configuração
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={handleTest}
              disabled={testing || !hasCredentials}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : connStatus === "connected" ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              Testar Conexão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
