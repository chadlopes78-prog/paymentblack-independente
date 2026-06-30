import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { Loader2, Smartphone, Wallet, TrendingUp, Percent, CheckCircle2 } from "lucide-react";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_dashboard/payment-summary")({
  component: PaymentSummaryPage,
});

type Sale = {
  amount: number;
  bump_amount: number | null;
  payment_method: string | null;
  status: string | null;
};

const SUCCESS = new Set(["approved", "paid", "success"]);

function methodOf(m: string | null | undefined): "mpesa" | "emola" | "other" {
  const s = (m || "").toLowerCase();
  if (s.includes("mpesa") || s.includes("m-pesa")) return "mpesa";
  if (s.includes("emola") || s.includes("e-mola")) return "emola";
  return "other";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "MZN",
    maximumFractionDigits: 2,
  }).format(n);

const COLORS = { mpesa: "#dc2626", emola: "#f59e0b" };

function PaymentSummaryPage() {
  const now = new Date();
  const [range, setRange] = useState<{ from: Date; to: Date }>({
    from: startOfDay(subDays(now, 6)),
    to: endOfDay(now),
  });
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("sales")
        .select("amount,bump_amount,payment_method,status")
        .eq("user_id", session.user.id)
        .in("status", ["approved", "paid", "success"])
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString());
      if (!cancelled) {
        setSales((data || []) as Sale[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const summary = useMemo(() => {
    const acc = {
      mpesa: { gross: 0, net: 0, count: 0 },
      emola: { gross: 0, net: 0, count: 0 },
    };
    for (const s of sales) {
      if (!SUCCESS.has((s.status || "").toLowerCase())) continue;
      const m = methodOf(s.payment_method);
      if (m === "other") continue;
      const amt = Number(s.amount || 0);
      const net = Math.max(0, amt - amt * 0.15 - 15);
      acc[m].gross += amt;
      acc[m].net += net;
      acc[m].count += 1;
    }
    const grandNet = acc.mpesa.net + acc.emola.net;
    return {
      mpesa: {
        total: acc.mpesa.net,
        gross: acc.mpesa.gross,
        count: acc.mpesa.count,
        avg: acc.mpesa.count ? acc.mpesa.net / acc.mpesa.count : 0,
        pct: grandNet ? (acc.mpesa.net / grandNet) * 100 : 0,
      },
      emola: {
        total: acc.emola.net,
        gross: acc.emola.gross,
        count: acc.emola.count,
        avg: acc.emola.count ? acc.emola.net / acc.emola.count : 0,
        pct: grandNet ? (acc.emola.net / grandNet) * 100 : 0,
      },
      grand: grandNet,
      grandGross: acc.mpesa.gross + acc.emola.gross,
    };
  }, [sales]);


  const pieData = useMemo(
    () =>
      [
        { name: "M-Pesa", value: summary.mpesa.total, key: "mpesa" as const },
        { name: "e-Mola", value: summary.emola.total, key: "emola" as const },
      ].filter((d) => d.value > 0),
    [summary],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Resumo por Método de Pagamento
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Apenas vendas confirmadas no período selecionado.
          </p>
        </div>
        <DateRangePicker initialPreset="last7days" initialRange={range} onRangeChange={(r) => setRange(r)} />
      </div>

      {loading ? (
        <div className="flex h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <MethodCard
              label="M-Pesa"
              icon={<Smartphone className="h-5 w-5" />}
              accent="bg-red-500/10 text-red-500 border-red-500/20"
              data={summary.mpesa}
            />
            <MethodCard
              label="e-Mola"
              icon={<Wallet className="h-5 w-5" />}
              accent="bg-amber-500/10 text-amber-500 border-amber-500/20"
              data={summary.emola}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="rounded-2xl border-border bg-card shadow-sm md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground">Distribuição por Método</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/60">
                      Sem vendas confirmadas
                    </p>
                  </div>
                ) : (
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          <linearGradient id="g-mpesa" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#ef4444" />
                            <stop offset="100%" stopColor="#b91c1c" />
                          </linearGradient>
                          <linearGradient id="g-emola" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#d97706" />
                          </linearGradient>
                        </defs>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={3}
                          stroke="var(--color-card)"
                          strokeWidth={3}
                          isAnimationActive={false}
                        >
                          {pieData.map((d) => (
                            <Cell key={d.key} fill={`url(#g-${d.key})`} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => fmt(Number(v))}
                          contentStyle={{
                            borderRadius: 14,
                            border: "1px solid var(--color-border)",
                            background: "var(--color-popover)",
                            color: "var(--color-popover-foreground)",
                            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.25)",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            color: "var(--color-muted-foreground)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground">Faturamento Líquido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-3xl font-black tracking-tight text-emerald-500">{fmt(summary.grand)}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {summary.mpesa.count + summary.emola.count} transações · bruto {fmt(summary.grandGross)}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500/80">
                    Já descontado 15% + 15 MT por venda
                  </p>
                </div>
                <div className="space-y-2 border-t border-border pt-3">
                  <Row color={COLORS.mpesa} label="M-Pesa" value={fmt(summary.mpesa.total)} pct={summary.mpesa.pct} />
                  <Row color={COLORS.emola} label="e-Mola" value={fmt(summary.emola.total)} pct={summary.emola.pct} />
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ color, label, value, pct }: { color: string; label: string; value: string; pct: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-foreground">{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{pct.toFixed(1)}%</p>
      </div>
    </div>
  );
}


function MethodCard({
  label,
  icon,
  accent,
  data,
}: {
  label: string;
  icon: React.ReactNode;
  accent: string;
  data: { total: number; gross: number; count: number; avg: number; pct: number };
}) {
  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-bold text-foreground">{label}</CardTitle>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${accent}`}>{icon}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total líquido</p>
          <p className="text-2xl font-black tracking-tight text-emerald-500">{fmt(data.total)}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            Bruto {fmt(data.gross)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-border pt-2">
          <Stat label="Transações" value={String(data.count)} />
          <Stat label="Ticket médio" value={fmt(data.avg)} icon={<TrendingUp className="h-3 w-3" />} />
          <Stat label="% do total" value={`${data.pct.toFixed(1)}%`} icon={<Percent className="h-3 w-3" />} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

