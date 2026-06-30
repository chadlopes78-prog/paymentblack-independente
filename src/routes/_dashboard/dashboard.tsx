import { useState, useMemo, lazy, Suspense, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  BarChart3,
  AlertTriangle,
  RefreshCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRangePicker, DateRangePreset } from "@/components/dashboard/DateRangePicker";
import { format, subDays, differenceInDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

// Lazy load chart (Recharts ~220KB)
const PerformanceChart = lazy(() => import("@/components/dashboard/PerformanceChart"));

export const Route = createFileRoute("/_dashboard/dashboard")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "overview",
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    const saved = sessionStorage.getItem("dashboard-date-range");
    if (saved) {
      try {
        const { from, to } = JSON.parse(saved);
        return { from: new Date(from), to: new Date(to) };
      } catch (e) {
        console.error("Error parsing saved date range", e);
      }
    }
    return {
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    };
  });
  
  const [preset, setPreset] = useState<DateRangePreset>(() => {
    return (sessionStorage.getItem("dashboard-preset") as DateRangePreset) || "last7days";
  });


  const queryClient = useQueryClient();

  const { data: dashboardData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-metrics", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      console.log("[Dashboard] Fetching metrics for range:", dateRange.from.toISOString(), "to", dateRange.to.toISOString());
      
      const { data, error } = await supabase.rpc('get_dashboard_metrics', {
        p_start_date: dateRange.from.toISOString(),
        p_end_date: dateRange.to.toISOString()
      });

      if (error) {
        console.error("[Dashboard] RPC Error details:", error);
        
        // Fallback for non-RPC data if it fails
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw error;

        console.log("[Dashboard] Falling back to direct query due to RPC error");
        const { data: sales, error: salesError } = await supabase
          .from("sales")
          .select("amount, status, created_at, products(name)")
          .eq("user_id", user.id)
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString());

        if (salesError) throw salesError;

        const stats = {
          total_transactions: sales.length,
          success_count: sales.filter(s => s.status && ["approved", "paid", "success"].includes(s.status)).length,
          failed_count: sales.filter(s => s.status && ["failed", "error", "cancelled", "canceled"].includes(s.status)).length,
          total_value: sales.reduce((acc, s) => acc + Number(s.amount), 0),
          received_value: sales.filter(s => s.status && ["approved", "paid", "success"].includes(s.status)).reduce((acc, s) => acc + Number(s.amount), 0),
          lost_value: sales.filter(s => s.status && ["failed", "error", "cancelled", "canceled"].includes(s.status)).reduce((acc, s) => acc + Number(s.amount), 0),
        };

        const recentSales = sales.slice(0, 10).map(s => ({
          ...s,
          product_name: (s.products as any)?.name
        }));

        // Group by day for chart
        const dailyMap = new Map();
        sales.forEach(s => {
          if (!s.created_at) return;
          const day = startOfDay(parseISO(s.created_at)).toISOString();
          const current = dailyMap.get(day) || { sucesso: 0, falha: 0 };
          if (s.status && ["approved", "paid", "success"].includes(s.status)) current.sucesso++;
          else if (s.status && ["failed", "error"].includes(s.status)) current.falha++;
          dailyMap.set(day, current);
        });

        const chartData = Array.from(dailyMap.entries()).map(([day, val]) => ({
          day,
          ...val
        }));

        return {
          stats,
          chartData,
          recentSales
        };
      }

      console.log("[Dashboard] RPC Data received:", data);

      const result = data as any;
      
      // Process chart data to ensure labels are formatted and empty days are handled
      const rawChartData = result.chartData || [];
      const stats = result.stats || {
        total_transactions: 0,
        success_count: 0,
        failed_count: 0,
        total_value: 0,
        received_value: 0,
        lost_value: 0
      };
      const recentSales = result.recentSales || [];

      const days = differenceInDays(dateRange.to, dateRange.from) + 1;
      const formattedChartData = [];
      
      for (let i = 0; i < days; i++) {
        const dayDate = startOfDay(subDays(dateRange.to, days - 1 - i));
        const dayStr = format(dayDate, "yyyy-MM-dd");
        const dayLabel = format(dayDate, "dd/MM", { locale: ptBR });
        
        const existingDay = rawChartData.find((d: any) => 
          d.day && format(parseISO(d.day), "yyyy-MM-dd") === dayStr
        );

        formattedChartData.push({
          name: dayLabel,
          sucesso: existingDay ? Number(existingDay.sucesso || 0) : 0,
          falha: existingDay ? Number(existingDay.falha || 0) : 0,
        });
      }

      return {
        stats,
        chartData: formattedChartData,
        recentSales
      };
    },
    staleTime: 1000 * 10, // 10 seconds for more "realtime" feel
    retry: 1,
  });


  const handleRangeChange = (range: { from: Date; to: Date }, newPreset: DateRangePreset) => {
    setDateRange(range);
    setPreset(newPreset);
    sessionStorage.setItem("dashboard-date-range", JSON.stringify(range));
    sessionStorage.setItem("dashboard-preset", newPreset);
  };

  // Realtime: refresh dashboard the moment a sale is inserted/updated (e.g. status -> paid)
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user?.id) return;
      channel = supabase
        .channel(`dashboard-sales-${session.user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${session.user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
          }
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);



  const { heroKpis, metricCards } = useMemo(() => {
    if (!dashboardData) return { heroKpis: [], metricCards: [] };

    const { stats } = dashboardData;
    const total = Number(stats.total_transactions) || 0;
    const success = Number(stats.success_count) || 0;
    const receivedGross = Number(stats.received_value) || 0;
    // Gateway fee: 15% + 15 MZN per approved transaction
    const gatewayFee = receivedGross * 0.15 + success * 15;
    const received = Math.max(0, receivedGross - gatewayFee);
    const conversionRate = total > 0 ? (success / total) * 100 : 0;
    const avgTicket = success > 0 ? received / success : 0;

    const fmtMT = (v: number) =>
      `${Number(v).toLocaleString("pt-MZ", { maximumFractionDigits: 0 })} MT`;

    const heroKpis = [
      {
        title: "Valor Recebido (líquido)",
        value: fmtMT(received),
        description: `Bruto ${fmtMT(receivedGross)} − taxa ${fmtMT(gatewayFee)}`,
        icon: CreditCard,
        accent: "bg-emerald-500",
        tone: "text-emerald-600",
      },
      {
        title: "Taxa de Conversão",
        value: `${conversionRate.toFixed(1)}%`,
        description: `${success} de ${total} tentativas`,
        icon: TrendingUp,
        accent: "bg-blue-600",
        tone: "text-blue-600",
      },
      {
        title: "Ticket Médio (líquido)",
        value: fmtMT(avgTicket),
        description: "Por venda aprovada, após taxa",
        icon: DollarSign,
        accent: "bg-slate-900",
        tone: "text-slate-900",
      },
    ];

    const metricCards = [
      {
        title: "Total de Transações",
        value: stats.total_transactions,
        description: "Volume total de pedidos",
        icon: ShoppingCart,
        color: "bg-slate-900",
      },
      {
        title: "Vendas com Sucesso",
        value: stats.success_count,
        description: "Pagamentos confirmados",
        icon: TrendingUp,
        color: "bg-emerald-500",
      },
      {
        title: "Vendas com Falha",
        value: stats.failed_count,
        description: "Pagamentos não concluídos",
        icon: TrendingDown,
        color: "bg-rose-500",
      },
      {
        title: "Valor Total",
        value: fmtMT(Number(stats.total_value)),
        description: "Soma de todas as tentativas",
        icon: DollarSign,
        color: "bg-blue-600",
      },
      {
        title: "Valor Perdido",
        value: fmtMT(Number(stats.lost_value)),
        description: "Oportunidades perdidas",
        icon: AlertCircle,
        color: "bg-rose-600",
      },
    ];

    return { heroKpis, metricCards };
  }, [dashboardData]);

  if (isLoading) return (
    <div className="space-y-6 pb-12 max-w-[1400px] mx-auto px-4 md:px-0 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-3 w-64 rounded-md" />
        </div>
        <Skeleton className="h-10 w-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-3xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    </div>
  );


  if (!dashboardData) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <AlertTriangle className="h-12 w-12 text-rose-500" />
      <p className="font-black text-slate-900 uppercase tracking-widest text-xs">Erro ao carregar dados. Tente atualizar a página.</p>
      <Button onClick={() => refetch()} variant="outline" size="sm" className="rounded-xl font-black uppercase tracking-tighter">
        <RefreshCcw className="mr-2 h-4 w-4" /> Tentar Novamente
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-[1400px] mx-auto px-4 md:px-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Dashboard</h1>
            {isFetching && <RefreshCcw className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-tighter">Visão geral sincronizada com seu Checkout.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker onRangeChange={handleRangeChange} initialPreset={preset} initialRange={dateRange} />
          
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {heroKpis.map((kpi) => (
          <Card
            key={kpi.title}
            className="relative border-none shadow-lg bg-white overflow-hidden rounded-3xl transition-all hover:shadow-2xl hover:-translate-y-0.5"
          >
            <div className={cn("absolute inset-x-0 top-0 h-1.5", kpi.accent)} />
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {kpi.title}
                </span>
                <div className={cn("p-2 rounded-xl bg-slate-50", kpi.tone)}>
                  <kpi.icon className="h-4 w-4" />
                </div>
              </div>
              <div className={cn("mt-4 text-4xl md:text-5xl font-black tracking-tighter", kpi.tone)}>
                {kpi.value}
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase tracking-tighter">
                {kpi.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metricCards.map((metric) => (
          <Card key={metric.title} className="border-none shadow-sm bg-white overflow-hidden rounded-2xl transition-all hover:shadow-md hover:-translate-y-0.5 group">
            <div className={cn("h-0.5 w-full transition-all group-hover:h-1", metric.color)} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 leading-tight">{metric.title}</span>
              <metric.icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-900 transition-colors shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-black text-slate-900 tracking-tighter truncate">{metric.value}</div>
              <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-tighter line-clamp-1">{metric.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>


      <div className="grid grid-cols-1 gap-6">
        <Card className="border-none shadow-xl bg-white p-6 rounded-3xl">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Gráfico de Performance
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase text-slate-400">Conversão diária de vendas (Sucesso vs Falha)</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-8">
            <Suspense fallback={<div className="h-[350px] w-full rounded-2xl bg-slate-50 animate-pulse" />}>
              <PerformanceChart data={dashboardData.chartData} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden ring-1 ring-slate-100 flex flex-col">
          <CardHeader className="bg-slate-50/50 border-b pb-4">
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" /> Atividade Recente
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase text-slate-400">
                Últimas transações do seu checkout.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[400px]">
            {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {dashboardData.recentSales.map((sale: any) => (
                  <div key={sale.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center shadow-sm",
                        ["paid", "approved", "success"].includes(sale.status) ? "bg-emerald-100 text-emerald-600" :
                        ["failed", "error"].includes(sale.status) ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-600"
                      )}>
                        {["paid", "approved", "success"].includes(sale.status) ? <TrendingUp className="h-5 w-5" /> :
                         ["failed", "error"].includes(sale.status) ? <TrendingDown className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">
                          {["paid", "approved", "success"].includes(sale.status) ? "Venda Aprovada" :
                           ["failed", "error"].includes(sale.status) ? "Pagamento Falhou" : "Novo Pedido"}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[200px]">
                          {sale.product_name || "Produto"} • {sale.customer_name || "Cliente"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-900">
                        {Number(sale.amount).toLocaleString("pt-MZ")} MT
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">
                        {format(parseISO(sale.created_at), "HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                  <ShoppingCart className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma atividade recente</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
