import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/admins";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, CheckCircle2, Clock, XCircle, ShieldX, ShieldCheck,
  Search, RefreshCw, Loader2, BarChart3, UserCheck, UserX, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/admin")({
  component: AdminPage,
});

// ─── API helper ────────────────────────────────────────────────────────────────

async function callAdmin(action: string, extra: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Não autenticado.");
  const res = await fetch("/.netlify/functions/api-admin", {
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

// ─── status helpers ─────────────────────────────────────────────────────────

type UserStatus = "pending" | "approved" | "rejected" | "banned";

const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "Pendente",  color: "bg-amber-50 border-amber-200 text-amber-700",   icon: <Clock className="h-3 w-3" /> },
  approved: { label: "Aprovado",  color: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: "Rejeitado", color: "bg-red-50 border-red-200 text-red-700",         icon: <XCircle className="h-3 w-3" /> },
  banned:   { label: "Banido",    color: "bg-slate-100 border-slate-300 text-slate-600",  icon: <ShieldX className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as UserStatus] ?? STATUS_CONFIG.pending;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px] font-bold", cfg.color)}>
      {cfg.icon} {cfg.label}
    </Badge>
  );
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-MZ", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Guard — client-side (backend double-checks)
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !isAdminEmail(session.user.email)) {
        navigate({ to: "/dashboard" });
      }
    })();
  }, [navigate]);

  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<string>("");
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 20;

  const [confirm, setConfirm] = useState<{
    userId: string; name: string; action: UserStatus; label: string;
  } | null>(null);

  // ── Stats ──
  const { data: statsData } = useQuery({
    queryKey: ["admin_stats"],
    queryFn: () => callAdmin("stats"),
    refetchInterval: 30_000,
  });
  const stats = statsData?.stats ?? {};

  // ── User list ──
  const { data: listData, isLoading, refetch } = useQuery({
    queryKey: ["admin_users", page, search, filter],
    queryFn: () => callAdmin("list_users", { page, pageSize: PAGE_SIZE, search, status: filter }),
    keepPreviousData: true,
  } as any);

  const users: any[] = (listData as any)?.users ?? [];
  const total: number = (listData as any)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Reset to page 1 on filter/search change
  useEffect(() => { setPage(1); }, [search, filter]);

  // ── Mutation ──
  const setStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      callAdmin("set_status", { userId, status }),
    onSuccess: (_, { status }) => {
      const label = STATUS_CONFIG[status]?.label ?? status;
      toast.success(`Usuário ${label.toLowerCase()} com sucesso.`);
      qc.invalidateQueries({ queryKey: ["admin_users"] });
      qc.invalidateQueries({ queryKey: ["admin_stats"] });
      setConfirm(null);
    },
    onError: (e: Error) => { toast.error(e.message); setConfirm(null); },
  });

  function ask(userId: string, name: string, action: UserStatus) {
    const labels: Record<UserStatus, string> = {
      approved: "Aprovar", rejected: "Rejeitar", banned: "Banir", pending: "Reativar",
    };
    setConfirm({ userId, name, action, label: labels[action] });
  }

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
          Controle do Sistema
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie usuários, aprovações e monitore a plataforma.
        </p>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={<Users className="h-5 w-5 text-slate-500" />}    label="Total"    value={stats.total    ?? 0} color="bg-slate-50"   />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Aprovados" value={stats.approved ?? 0} color="bg-emerald-50" />
        <StatCard icon={<Clock className="h-5 w-5 text-amber-500" />}    label="Pendentes" value={stats.pending  ?? 0} color="bg-amber-50"   highlight={stats.pending > 0} />
        <StatCard icon={<XCircle className="h-5 w-5 text-red-500" />}    label="Rejeitados" value={stats.rejected ?? 0} color="bg-red-50"   />
        <StatCard icon={<ShieldX className="h-5 w-5 text-slate-600" />}  label="Banidos"   value={stats.banned   ?? 0} color="bg-slate-100" />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-blue-500" />} label="Novos (7d)" value={stats.new_7d ?? 0} color="bg-blue-50"  />
      </div>

      {/* ── User management ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Usuários Cadastrados
              </CardTitle>
              <CardDescription>{total} usuário{total !== 1 ? "s" : ""} no total</CardDescription>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 self-start" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9 h-9"
                placeholder="Pesquisar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["", "pending", "approved", "rejected", "banned"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={cn(
                    "h-9 px-3 rounded-lg border text-xs font-semibold transition-colors",
                    filter === s
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                  )}
                >
                  {s === "" ? "Todos" : STATUS_CONFIG[s as UserStatus]?.label ?? s}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Usuário</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Cadastro</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Último Acesso</th>
                    <th className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Produtos</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 leading-tight">{u.full_name}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell whitespace-nowrap">
                        {fmtDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell whitespace-nowrap">
                        {fmtDate(u.last_login)}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-xs font-bold text-slate-700">{u.product_count}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ActionButtons user={u} onAction={ask} loading={setStatus.isPending} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-400">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja <strong>{confirm?.label?.toLowerCase()}</strong> o usuário{" "}
              <strong>{confirm?.name}</strong>?
              {confirm?.action === "banned" && (
                <span className="block mt-1 text-red-600 font-medium">
                  O usuário perderá acesso imediatamente a toda a plataforma.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.action === "banned" || confirm?.action === "rejected" ? "bg-red-600 hover:bg-red-700" : ""}
              onClick={() => confirm && setStatus.mutate({ userId: confirm.userId, status: confirm.action })}
              disabled={setStatus.isPending}
            >
              {setStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Action buttons per row ────────────────────────────────────────────────────

function ActionButtons({
  user,
  onAction,
  loading,
}: {
  user: any;
  onAction: (id: string, name: string, action: UserStatus) => void;
  loading: boolean;
}) {
  const s: UserStatus = user.status as UserStatus;
  const n = user.full_name || user.email;
  const btn = (action: UserStatus, label: string, variant: "default" | "outline" | "destructive" = "outline") => (
    <Button
      key={action}
      size="sm"
      variant={variant}
      className="h-7 text-xs"
      disabled={loading}
      onClick={() => onAction(user.id, n, action)}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      {s === "pending"  && btn("approved", "Aprovar", "default")}
      {s === "pending"  && btn("rejected", "Rejeitar", "destructive")}
      {s === "approved" && btn("banned", "Banir", "destructive")}
      {s === "approved" && btn("rejected", "Rejeitar", "outline")}
      {s === "rejected" && btn("approved", "Reativar", "default")}
      {s === "rejected" && btn("banned", "Banir", "destructive")}
      {s === "banned"   && btn("approved", "Reativar", "default")}
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, color, highlight,
}: {
  icon: React.ReactNode; label: string; value: number; color: string; highlight?: boolean;
}) {
  return (
    <Card className={cn("border", highlight && "border-amber-300 shadow-amber-100/60 shadow-md")}>
      <CardContent className={cn("p-4 rounded-xl", color)}>
        <div className="flex items-center justify-between mb-2">
          {icon}
          {highlight && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">!</span>
          )}
        </div>
        <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}
