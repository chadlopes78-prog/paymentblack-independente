import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  ShoppingCart,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  subDays,
  differenceInDays,
  startOfDay,
  endOfDay,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import MiniBarChart from "@/components/dashboard/MiniBarChart";

export const Route = createFileRoute("/_dashboard/dashboard")({
  component: DashboardPage,
});

type Period = "today" | "week" | "month" | "year";

const PERIODS: { id: Period; label: string; getRange: () => { from: Date; to: Date } }[] = [
  { id: "today", label: "Hoje", getRange: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { id: "week", label: "7 dias", getRange: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { id: "month", label: "30 dias", getRange: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { id: "year", label: "12 meses", getRange: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
];

function DashboardPage() {
  const [period, setPeriod] = useState<Period>(
    () => (sessionStorage.getItem("dash-period") as Period) || "week"
  );

  const dateRange = useMemo(() => {
    const p = PERIODS.find(p => p.id === period)!;
    return p.getRange();
  }, [period]);

  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-v2", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const { data: rpc, error } = await supabase.rpc("get_dashboard_metrics", {
        p_start_date: dateRange.from.toISOString(),
        p_end_date: dateRange.to.toISOString(),
      });

      if (error) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw error;

        const { data: sales, error: salesError } = await supabase
          .from("sales")
          .select("id, amount, status, created_at, customer_name, products(name)")
          .eq("user_id", user.id)
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString())
          .order("created_at", { ascending: false });

        if (salesError) throw salesError;

        const isOk = (s: string) => ["approved", "paid", "success"].includes(s);
        const isBad = (s: string) => ["failed", "error", "cancelled", "canceled"].includes(s);

        const stats = {
          total_transactions: sales.length,
          success_count: sales.filter(s => isOk(s.status ?? "")).length,
          failed_count: sales.filter(s => isBad(s.status ?? "")).length,
          total_value: sales.reduce((a, s) => a + Number(s.amount), 0),
          received_value: sales.filter(s => isOk(s.status ?? "")).reduce((a, s) => a + Number(s.amount), 0),
          lost_value: sales.filter(s => isBad(s.status ?? "")).reduce((a, s) => a + Number(s.amount), 0),
        };

        const dailyMap = new Map<string, { sucesso: number; falha: number }>();
        sales.forEach(s => {
          if (!s.created_at) return;
          const key = format(startOfDay(parseISO(s.created_at)), "yyyy-MM-dd");
          const cur = dailyMap.get(key) || { sucesso: 0, falha: 0 };
          if (isOk(s.status ?? "")) cur.sucesso++;
          else if (isBad(s.status ?? "")) cur.falha++;
          dailyMap.set(key, cur);
        });

        const days = differenceInDays(dateRange.to, dateRange.from) + 1;
        const chartData = Array.from({ length: days }, (_, i) => {
          const d = startOfDay(subDays(dateRange.to, days - 1 - i));
          const key = format(d, "yyyy-MM-dd");
          const v = dailyMap.get(key) || { sucesso: 0, falha: 0 };
          return { name: format(d, "dd/MM", { locale: ptBR }), ...v };
        });

        return { stats, chartData, recentSales: sales.slice(0, 15).map(s => ({ ...s, product_name: (s.products as any)?.name })) };
      }

      const result = rpc as any;
      const raw = result.chartData || [];
      const stats = result.stats || { total_transactions: 0, success_count: 0, failed_count: 0, total_value: 0, received_value: 0, lost_value: 0 };

      const days = differenceInDays(dateRange.to, dateRange.from) + 1;
      const chartData = Array.from({ length: days }, (_, i) => {
        const d = startOfDay(subDays(dateRange.to, days - 1 - i));
        const dayStr = format(d, "yyyy-MM-dd");
        const found = raw.find((x: any) => x.day && format(parseISO(x.day), "yyyy-MM-dd") === dayStr);
        return {
          name: format(d, "dd/MM", { locale: ptBR }),
          sucesso: found ? Number(found.sucesso || 0) : 0,
          falha: found ? Number(found.falha || 0) : 0,
        };
      });

      return { stats, chartData, recentSales: (result.recentSales || []).map((s: any) => ({ ...s, product_name: s.product_name })) };
    },
    staleTime: 1000 * 15,
    retry: 1,
  });

  useEffect(() => {
    let cancelled = false;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user?.id) return;
      ch = supabase
        .channel(`dash-${session.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${session.user.id}` }, () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-v2"] });
        })
        .subscribe();
    })();
    return () => { cancelled = true; if (ch) supabase.removeChannel(ch); };
  }, [queryClient]);

  const metrics = useMemo(() => {
    if (!data) return null;
    const { stats } = data;
    const total = Number(stats.total_transactions) || 0;
    const success = Number(stats.success_count) || 0;
    const receivedGross = Number(stats.received_value) || 0;
    const gatewayFee = receivedGross * 0.15 + success * 15;
    const received = Math.max(0, receivedGross - gatewayFee);
    const conversion = total > 0 ? (success / total) * 100 : 0;
    const avgTicket = success > 0 ? received / success : 0;

    const fmt = (v: number) => Number(v).toLocaleString("pt-MZ", { maximumFractionDigits: 0 }) + " MT";

    return { total, success, failed: Number(stats.failed_count) || 0, received, receivedGross, gatewayFee, conversion, avgTicket, totalValue: Number(stats.total_value) || 0, lostValue: Number(stats.lost_value) || 0, fmt };
  }, [data]);

  if (isLoading) return (
    <div className="space-y-5 pb-10 max-w-5xl mx-auto">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0,1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );

  if (!data || !metrics) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <AlertTriangle className="h-8 w-8 text-rose-400" />
      <p className="text-sm text-muted-foreground">Erro ao carregar dados.</p>
      <Button onClick={() => refetch()} variant="outline" size="sm">
        <RefreshCcw className="mr-2 h-4 w-4" /> Tentar novamente
      </Button>
    </div>
  );

  return (
    <div className="space-y-5 pb-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Resumo</h1>
          {isFetching && <RefreshCcw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => { setPeriod(p.id); sessionStorage.setItem("dash-period", p.id); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                period === p.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue hero */}
      <div className="rounded-2xl bg-emerald-600 p-6 text-white">
        <p className="text-sm font-medium text-emerald-100 mb-1">Faturamento líquido</p>
        <p className="text-4xl font-bold tracking-tight">{metrics.fmt(metrics.received)}</p>
        <p className="text-xs text-emerald-200 mt-2">
          Bruto {metrics.fmt(metrics.receivedGross)} · taxa {metrics.fmt(metrics.gatewayFee)}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Vendas aprovadas", value: String(metrics.success), icon: TrendingUp, color: "text-emerald-600" },
          { label: "Taxa de conversão", value: `${metrics.conversion.toFixed(1)}%`, icon: TrendingUp, color: "text-blue-600" },
          { label: "Ticket médio", value: metrics.fmt(metrics.avgTicket), icon: CreditCard, color: "text-foreground" },
          { label: "Falhas", value: String(metrics.failed), icon: TrendingDown, color: "text-rose-500" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <s.icon className={cn("h-3.5 w-3.5", s.color)} />
            </div>
            <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total de transações</p>
          <p className="text-xl font-bold text-foreground">{metrics.total}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Volume total tentado</p>
          <p className="text-xl font-bold text-foreground">{metrics.fmt(metrics.totalValue)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-sm font-medium text-foreground mb-4">Vendas por dia</p>
        <MiniBarChart data={data.chartData} />
      </div>

      {/* Recent transactions */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-medium text-foreground">Transações recentes</p>
        </div>
        {data.recentSales.length > 0 ? (
          <div className="divide-y divide-border">
            {data.recentSales.map((sale: any) => {
              const ok = ["paid", "approved", "success"].includes(sale.status);
              const fail = ["failed", "error"].includes(sale.status);
              return (
                <div key={sale.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs",
                      ok ? "bg-emerald-100 text-emerald-700" : fail ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {ok ? <TrendingUp className="h-3.5 w-3.5" /> : fail ? <TrendingDown className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{sale.product_name || "Produto"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sale.customer_name || "—"} · {format(parseISO(sale.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className={cn(
                      "hidden sm:block text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      ok ? "bg-emerald-100 text-emerald-700" : fail ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {ok ? "Aprovado" : fail ? "Falhou" : "Pendente"}
                    </span>
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {Number(sale.amount).toLocaleString("pt-MZ")} MT
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-7 w-7 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma transação no período</p>
          </div>
        )}
      </div>
    </div>
  );
}
