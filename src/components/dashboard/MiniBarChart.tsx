import { memo } from "react";

interface ChartDatum {
  name: string;
  sucesso: number;
  falha: number;
}

function MiniBarChartImpl({ data }: { data: ChartDatum[] }) {
  const maxVal = Math.max(...data.map(d => d.sucesso + d.falha), 1);
  const hasData = data.some(d => d.sucesso > 0 || d.falha > 0);

  // Show at most 30 bars to avoid cramping
  const visible = data.length > 30 ? data.slice(-30) : data;

  return (
    <div className="w-full">
      {!hasData && (
        <div className="flex h-[200px] items-center justify-center">
          <p className="text-xs text-muted-foreground">Sem dados no período</p>
        </div>
      )}
      {hasData && (
        <>
          <div className="flex items-end gap-[2px] h-[180px] w-full px-1">
            {visible.map((d, i) => {
              const total = d.sucesso + d.falha;
              const heightPct = total / maxVal;
              const successPct = total > 0 ? d.sucesso / total : 0;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end group relative"
                  style={{ height: "100%" }}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                    <div className="bg-popover border border-border rounded-lg px-2 py-1.5 shadow-md text-[10px] whitespace-nowrap">
                      <div className="font-semibold text-foreground mb-0.5">{d.name}</div>
                      {d.sucesso > 0 && <div className="text-emerald-600">✓ {d.sucesso} aprovadas</div>}
                      {d.falha > 0 && <div className="text-rose-500">✗ {d.falha} falhas</div>}
                    </div>
                  </div>

                  <div
                    className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse"
                    style={{ height: `${Math.max(heightPct * 100, 2)}%` }}
                  >
                    {/* Success portion */}
                    {d.sucesso > 0 && (
                      <div
                        className="w-full bg-emerald-500"
                        style={{ height: `${successPct * 100}%`, minHeight: d.sucesso > 0 ? 3 : 0 }}
                      />
                    )}
                    {/* Fail portion */}
                    {d.falha > 0 && (
                      <div
                        className="w-full bg-rose-300"
                        style={{ height: `${(1 - successPct) * 100}%`, minHeight: d.falha > 0 ? 3 : 0 }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X axis labels — show only ~6 evenly spaced */}
          <div className="flex items-center justify-between mt-2 px-1">
            {(() => {
              const step = Math.max(1, Math.floor(visible.length / 6));
              return visible
                .filter((_, i) => i === 0 || i === visible.length - 1 || i % step === 0)
                .map((d, i) => (
                  <span key={i} className="text-[9px] text-muted-foreground">{d.name}</span>
                ));
            })()}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 px-1">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Aprovadas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-rose-300" />
              <span className="text-[10px] text-muted-foreground">Falhas</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(MiniBarChartImpl);
