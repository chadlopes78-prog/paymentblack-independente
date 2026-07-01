/**
 * Per-user payment processing configuration — two independent exports:
 *
 *  <DocPaymentSection />   → goes inside the "Conta de Recebimento" card
 *  <E2pPaymentSection />   → goes in its own "Integração com Carteira" card
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
  Clock, Wifi, WifiOff, Loader2, Pencil, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── shared API helpers ────────────────────────────────────────────────────────

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

// ─── shared data hook ──────────────────────────────────────────────────────────

function usePaymentConfig() {
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
  return { cfg, isLoading, refetch };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export 1 — Document-based processing (lives inside "Conta de Recebimento")
// ═══════════════════════════════════════════════════════════════════════════════

export function DocPaymentSection() {
  const { cfg, isLoading, refetch } = usePaymentConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const hasDoc = !!cfg?.doc_file_url;
  const docEnabled: boolean = cfg?.doc_enabled ?? false;

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => callConfigApi("toggle_doc", { enabled }),
    onSuccess: (_, enabled) => {
      toast.success(enabled ? "Processamento por Documento ativado." : "Desativado.");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/payment-configs/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      let fileContent: string | undefined;
      if (file.type === "application/json" || file.name.endsWith(".json")) {
        fileContent = await file.text();
      }
      const result = await callConfigApi("save_doc", {
        fileUrl: urlData.publicUrl,
        fileName: file.name,
        fileSize: file.size,
        fileContent,
      });
      toast.success(result.parsed
        ? "Documento enviado e credenciais extraídas com sucesso!"
        : "Documento salvo. Nenhuma credencial foi extraída automaticamente.");
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      {/* sub-header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-100">
            <FileText className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-700">Processamento Avançado por Documento</p>
            <p className="text-[10px] text-slate-400">
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

      {/* Status / upload area */}
      {hasDoc ? (
        <div className="rounded-xl border bg-slate-50/60 p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-slate-800 truncate max-w-[180px]">
                  {cfg.doc_file_name || "Documento configurado"}
                </p>
                {cfg.doc_file_size && (
                  <span className="text-[10px] text-slate-400">{fmtBytes(cfg.doc_file_size)}</span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 pl-5">
                Última configuração: {fmtDate(cfg.doc_parsed_at || cfg.updated_at)}
              </p>
              {cfg.doc_credentials && (
                <p className="text-[10px] text-emerald-600 pl-5 font-medium">
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
              className="gap-1.5 text-xs h-7"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || removing}
            >
              <RefreshCw className={cn("h-3 w-3", uploading && "animate-spin")} />
              Substituir
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-7 text-red-600 hover:text-red-700 hover:border-red-200"
              onClick={handleRemove}
              disabled={removing || uploading}
            >
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 p-5 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-1.5">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <p className="text-xs text-slate-500">Enviando documento...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-5 w-5 text-slate-400" />
                <p className="text-xs font-medium text-slate-600">Clique para enviar documento</p>
                <p className="text-[10px] text-slate-400">JSON, TXT ou outros formatos fornecidos pelo provedor</p>
              </div>
            )}
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-xs h-7"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-3 w-3" />
            {uploading ? "Enviando..." : "Enviar Documento"}
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,.cfg,.conf,.yaml,.yml,application/json,text/plain"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export 2 — E2Payments manual credentials (lives in its own card)
// ═══════════════════════════════════════════════════════════════════════════════

export function E2pPaymentSection() {
  const { cfg, isLoading, refetch } = usePaymentConfig();

  // When credentials are already saved, start in read mode; editing requires clicking "Editar"
  const hasCredentials = !!(cfg?.e2p_mpesa_client_id || cfg?.e2p_emola_client_id);
  const [editing, setEditing] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const [mpesaClientId,     setMpesaClientId]     = useState(cfg?.e2p_mpesa_client_id     || "");
  const [mpesaClientSecret, setMpesaClientSecret] = useState(cfg?.e2p_mpesa_client_secret || "");
  const [mpesaWallet,       setMpesaWallet]       = useState(cfg?.e2p_mpesa_wallet        || "");
  const [emolaClientId,     setEmolaClientId]     = useState(cfg?.e2p_emola_client_id     || "");
  const [emolaClientSecret, setEmolaClientSecret] = useState(cfg?.e2p_emola_client_secret || "");
  const [emolaWallet,       setEmolaWallet]       = useState(cfg?.e2p_emola_wallet        || "");

  const e2pEnabled: boolean  = cfg?.e2p_enabled ?? false;
  const connStatus: string   = cfg?.e2p_connection_status || "untested";

  // Open form when no credentials yet
  const showForm = editing || !hasCredentials;

  function startEdit() {
    setMpesaClientId(cfg?.e2p_mpesa_client_id     || "");
    setMpesaClientSecret(cfg?.e2p_mpesa_client_secret || "");
    setMpesaWallet(cfg?.e2p_mpesa_wallet           || "");
    setEmolaClientId(cfg?.e2p_emola_client_id      || "");
    setEmolaClientSecret(cfg?.e2p_emola_client_secret || "");
    setEmolaWallet(cfg?.e2p_emola_wallet           || "");
    setEditing(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      callConfigApi("save_e2p", {
        mpesa: { clientId: mpesaClientId.trim(), clientSecret: mpesaClientSecret.trim(), wallet: mpesaWallet.trim() },
        emola: { clientId: emolaClientId.trim(), clientSecret: emolaClientSecret.trim(), wallet: emolaWallet.trim() },
      }),
    onSuccess: () => {
      toast.success("Credenciais E2Payments salvas.");
      refetch();
      setEditing(false);
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
    failed:    <XCircle       className="h-4 w-4 text-red-500"     />,
    untested:  <Clock         className="h-4 w-4 text-slate-400"   />,
  }[connStatus] ?? <Clock className="h-4 w-4 text-slate-400" />;

  const statusLabel = { connected: "Conectado", failed: "Falhou", untested: "Não testado" }[connStatus] ?? "—";

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Top bar: title + enable toggle ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">Credenciais da Carteira</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Configure o Client ID, Client Secret e Wallet ID fornecidos pela E2Payments para cada método.
          </p>
        </div>
        {hasCredentials && !editing && (
          <div className="flex items-center gap-3 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={startEdit}
            >
              <Pencil className="h-3 w-3" />
              Editar
            </Button>
            <Switch
              checked={e2pEnabled}
              onCheckedChange={(v) => toggleMutation.mutate(v)}
              disabled={toggleMutation.isPending}
            />
          </div>
        )}
      </div>

      {/* ── Status pill (when saved and not editing) ── */}
      {hasCredentials && !editing && (
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
          <Badge
            variant="outline"
            className={cn(
              "ml-auto text-[10px] font-bold",
              e2pEnabled
                ? "bg-violet-50 border-violet-200 text-violet-700"
                : "bg-slate-100 border-slate-200 text-slate-500",
            )}
          >
            {e2pEnabled ? "Ativo" : "Inativo"}
          </Badge>
        </div>
      )}

      {/* ── Credentials summary (read-only, when saved and not editing) ── */}
      {hasCredentials && !editing && (
        <div className="grid sm:grid-cols-2 gap-3">
          <CredSummaryCard
            label="M-Pesa"
            color="bg-red-500"
            clientId={cfg.e2p_mpesa_client_id}
            wallet={cfg.e2p_mpesa_wallet}
          />
          <CredSummaryCard
            label="e-Mola"
            color="bg-orange-400"
            clientId={cfg.e2p_emola_client_id}
            wallet={cfg.e2p_emola_wallet}
          />
        </div>
      )}

      {/* ── Credentials form (when editing or no credentials yet) ── */}
      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {hasCredentials ? "Editar credenciais" : "Configurar credenciais"}
            </p>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
              onClick={() => setShowSecrets((v) => !v)}
            >
              {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showSecrets ? "Ocultar segredos" : "Mostrar segredos"}
            </button>
          </div>

          {/* M-Pesa fields */}
          <CredFields
            label="M-Pesa"
            color="bg-red-500"
            showSecrets={showSecrets}
            clientId={mpesaClientId}       onClientId={setMpesaClientId}
            clientSecret={mpesaClientSecret} onClientSecret={setMpesaClientSecret}
            wallet={mpesaWallet}            onWallet={setMpesaWallet}
          />

          <div className="h-px bg-slate-100" />

          {/* e-Mola fields */}
          <CredFields
            label="e-Mola"
            color="bg-orange-400"
            showSecrets={showSecrets}
            clientId={emolaClientId}       onClientId={setEmolaClientId}
            clientSecret={emolaClientSecret} onClientSecret={setEmolaClientSecret}
            wallet={emolaWallet}            onWallet={setEmolaWallet}
          />

          {/* Action buttons */}
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
              title={!hasCredentials ? "Salve as credenciais antes de testar" : undefined}
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
            {editing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Test button when viewing saved creds ── */}
      {hasCredentials && !editing && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={handleTest}
          disabled={testing}
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
      )}
    </div>
  );
}

// ─── small sub-components ──────────────────────────────────────────────────────

function CredSummaryCard({
  label, color, clientId, wallet,
}: { label: string; color: string; clientId?: string; wallet?: string }) {
  return (
    <div className="rounded-lg border bg-slate-50/60 p-3 space-y-1.5">
      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        <span className={cn("inline-block w-2 h-2 rounded-full", color)} />
        {label}
      </p>
      <div className="space-y-0.5">
        <p className="text-[10px] text-slate-400">
          Client ID: <span className="text-slate-600 font-medium">{clientId ? `${clientId.slice(0, 8)}…` : "—"}</span>
        </p>
        <p className="text-[10px] text-slate-400">
          Wallet ID: <span className="text-slate-600 font-medium">{wallet || "—"}</span>
        </p>
      </div>
    </div>
  );
}

function CredFields({
  label, color, showSecrets,
  clientId, onClientId,
  clientSecret, onClientSecret,
  wallet, onWallet,
}: {
  label: string; color: string; showSecrets: boolean;
  clientId: string;     onClientId:     (v: string) => void;
  clientSecret: string; onClientSecret: (v: string) => void;
  wallet: string;       onWallet:       (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        <span className={cn("inline-block w-2 h-2 rounded-full", color)} />
        {label}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Client ID</Label>
          <Input
            value={clientId}
            onChange={(e) => onClientId(e.target.value)}
            placeholder="Informe o Client ID"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Client Secret</Label>
          <Input
            type={showSecrets ? "text" : "password"}
            value={clientSecret}
            onChange={(e) => onClientSecret(e.target.value)}
            placeholder="••••••••"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-[11px] text-slate-500">
            Número da Carteira — Wallet ID{" "}
            <span className="text-[10px] text-slate-400 font-normal">(fornecido pela E2Payments)</span>
          </Label>
          <Input
            value={wallet}
            onChange={(e) => onWallet(e.target.value)}
            placeholder="Ex: WAL-00123456 (Wallet ID da E2Payments)"
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-slate-400">
            Este campo recebe o Wallet ID da sua conta E2Payments, não um número de telefone.
          </p>
        </div>
      </div>
    </div>
  );
}
