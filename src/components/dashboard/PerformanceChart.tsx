import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  Cell,
} from "recharts";
import { memo } from "react";

interface ChartDatum {
  name: string;
  sucesso: number;
  falha: number;
}

function PerformanceChartImpl({ data }: { data: ChartDatum[] }) {
  const hasData = data.some((d) => d.sucesso > 0 || d.falha > 0);

  return (
    <div className="h-[350px] w-full relative">
      {!hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
            Sem dados no período selecionado
          </p>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-sucesso" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="grad-falha" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64748b" stopOpacity={1} />
              <stop offset="100%" stopColor="#64748b" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
            contentStyle={{
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.08)",
              padding: "10px 14px",
              fontSize: "11px",
            }}
            itemStyle={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}
            labelStyle={{ fontWeight: 800, color: "#0f172a", marginBottom: 4 }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{
              fontSize: "10px",
              fontWeight: 800,
              textTransform: "uppercase",
              paddingBottom: "20px",
              color: "#475569",
            }}
          />
          <Bar
            dataKey="sucesso"
            fill="url(#grad-sucesso)"
            radius={[6, 6, 0, 0]}
            name="Aprovadas"
            maxBarSize={28}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={`s-${i}`} />
            ))}
          </Bar>
          <Bar
            dataKey="falha"
            fill="url(#grad-falha)"
            radius={[6, 6, 0, 0]}
            name="Falhas"
            maxBarSize={28}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={`f-${i}`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(PerformanceChartImpl);
