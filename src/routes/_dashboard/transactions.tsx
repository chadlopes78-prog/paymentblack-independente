import { createFileRoute } from "@tanstack/react-router";
import { Receipt, Search, ArrowDownCircle, ArrowUpCircle, Wallet, CheckCircle2, XCircle, TrendingUp, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SaleProduct = { name?: string | null } | null;

export const Route = createFileRoute("/_dashboard/transactions")({
  component: TransactionsPage,
});

const SUCCESS_STATUSES = ["approved", "paid", "success"];
const FAILED_STATUSES = ["failed", "error", "cancelled", "canceled"];

function methodLabel(method?: string | null) {
  if (!method) return "-";
  const m = method.toLowerCase();
  if (m.includes("mpesa")) return "M-Pesa (mpesa_c2b)";
  if (m.includes("emola")) return "e-Mola (emola_c2b)";
  return method;
}

function statusInfo(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (SUCCESS_STATUSES.includes(s))
    return { label: "Aprovado", className: "bg-green-100 text-green-700 hover:bg-green-100" };
  if (FAILED_STATUSES.includes(s))
    return { label: s === "failed" ? "Falhou" : "Cancelado", className: "bg-red-100 text-red-700 hover:bg-red-100" };
  if (s === "pending")
    return { label: "Pendente", className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" };
  return { label: status || "-", className: "" };
}

function TransactionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: sales, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*, products(name)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user?.id) return;
      channel = supabase
        .channel(`transactions-list-${session.user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${session.user.id}` },
          () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const filtered = useMemo(() => {
    if (!sales) return [];
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      const m = (s.payment_method || "").toLowerCase();
      if (methodFilter === "mpesa" && !m.includes("mpesa")) return false;
      if (methodFilter === "emola" && !m.includes("emola")) return false;
      const st = (s.status || "").toLowerCase();
      if (statusFilter === "success" && !SUCCESS_STATUSES.includes(st)) return false;
      if (statusFilter === "pending" && st !== "pending") return false;
      if (statusFilter === "failed" && !FAILED_STATUSES.includes(st)) return false;
      if (q) {
        const hay = `${s.customer_name || ""} ${s.customer_phone || ""} ${s.transaction_id || ""} ${s.payment_reference || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sales, search, methodFilter, statusFilter]);

  const totals = useMemo(() => {
    const t = {
      sent: 0,
      received: 0,
      pending: 0,
      count: filtered.length,
      approvedCount: 0,
      pendingCount: 0,
      failedCount: 0,
    };
    for (const s of filtered) {
      const amount = Number(s.amount) || 0;
      const st = (s.status || "").toLowerCase();
      t.sent += amount;
      if (SUCCESS_STATUSES.includes(st)) {
        t.received += amount;
        t.approvedCount += 1;
      } else if (st === "pending") {
        t.pending += amount;
        t.pendingCount += 1;
      } else if (FAILED_STATUSES.includes(st)) {
        t.failedCount += 1;
      }
    }
    return t;
  }, [filtered]);

  const conversionRate = totals.count > 0 ? (totals.approvedCount / totals.count) * 100 : 0;
  const averageTicket = totals.approvedCount > 0 ? totals.received / totals.approvedCount : 0;

  const fmt = (n: number) => `${n.toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-7 w-7" /> Histórico de Transações
          </h1>
          <p className="text-muted-foreground">
            Dados em tempo real. Acompanhe todos os pagamentos processados (M-Pesa e e-Mola).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm("Remover registros inválidos e duplicados?")) return;
              const { data, error } = await supabase.rpc("clean_invalid_sales");
              if (error) { toast.error(error.message); return; }
              const r = (data as { deleted?: number; invalid?: number; duplicates_transaction?: number; duplicates_phone?: number } | null) ?? {};
              const total = r.deleted ?? 0;
              toast.success(total === 0 ? "Nenhum registro inválido ou duplicado" : `${total} removido(s)`);
              await queryClient.invalidateQueries({ queryKey: ["transactions"] });
              await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              await queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
            }}
          >
            🧹 Limpar Inválidos
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (!confirm("APAGAR TODAS as suas transações? Ação permanente.")) return;
              if (!confirm("Tem certeza absoluta? Todo o histórico será removido.")) return;
              const { data, error } = await supabase.rpc("wipe_all_sales");
              if (error) { toast.error(error.message); return; }
              const deleted = (data as { deleted?: number } | null)?.deleted ?? 0;
              toast.success(deleted === 0 ? "Nada para remover" : `${deleted} transação(ões) removida(s)`);
              await queryClient.invalidateQueries({ queryKey: ["transactions"] });
              await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              await queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
            }}
          >
            🗑️ Limpar Dados
          </Button>
        </div>


      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Receita (aprovado)</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(totals.received)}</div>
            <p className="text-xs text-muted-foreground">{totals.approvedCount} aprovadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Processado</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totals.sent)}</div>
            <p className="text-xs text-muted-foreground">{totals.count} transações</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <Target className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Aprovadas / Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{fmt(averageTicket)}</div>
            <p className="text-xs text-muted-foreground">Por venda aprovada</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aprovadas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600">{totals.approvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Wallet className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-yellow-600">{totals.pendingCount}</div>
            <p className="text-xs text-muted-foreground">{fmt(totals.pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Falhas</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">{totals.failedCount}</div>
          </CardContent>
        </Card>
      </div>


      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, telefone ou referência..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Método" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os métodos</SelectItem>
            <SelectItem value="mpesa">M-Pesa (mpesa_c2b)</SelectItem>
            <SelectItem value="emola">e-Mola (emola_c2b)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="success">Aprovado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="failed">Falhou / Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead>Recebido</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[240px]">Justificativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">Carregando transações...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    Nenhuma transação encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((sale) => {
                  const info = statusInfo(sale.status);
                  const amount = Number(sale.amount) || 0;
                  const isSuccess = SUCCESS_STATUSES.includes((sale.status || "").toLowerCase());
                  return (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{new Date(sale.created_at).toLocaleDateString("pt-MZ")}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(sale.created_at).toLocaleTimeString("pt-MZ", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{sale.customer_name || "Desconhecido"}</span>
                          <span className="text-xs text-muted-foreground">{sale.customer_phone || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>{(sale.products as SaleProduct)?.name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{methodLabel(sale.payment_method)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{fmt(amount)}</TableCell>
                      <TableCell className={`font-mono ${isSuccess ? "text-green-600 font-medium" : "text-muted-foreground"}`}>
                        {isSuccess ? fmt(amount) : fmt(0)}
                      </TableCell>
                      <TableCell>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                          {sale.transaction_id || sale.payment_reference || "-"}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={info.className}>{info.label}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        {sale.status_reason && info.label !== "Aprovado" ? (
                          <div
                            className="text-xs leading-snug whitespace-normal break-words rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 max-w-[280px]"
                            title={sale.status_reason}
                          >
                            {sale.status_reason}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
