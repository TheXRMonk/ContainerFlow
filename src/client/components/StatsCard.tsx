import { Sparkline } from "./Sparkline";

interface StatsCardProps {
  label: string;
  value: string;
  limit?: string;
  data: number[];
  timestamps?: number[];
  hoverValues?: number[];
  color: string;
  threshold?: number;
  sparklineHeight?: number;
  formatValue?: (v: number) => string;
  formatHoverValue?: (v: number) => string;
  showAverage?: boolean;
  formatAverage?: (v: number) => string;
  avgLabel?: string;
}

export function StatsCard({
  label,
  value,
  limit,
  data,
  timestamps,
  hoverValues,
  color,
  threshold,
  sparklineHeight = 52,
  formatValue,
  formatHoverValue,
  showAverage,
  formatAverage,
  avgLabel,
}: StatsCardProps) {
  const avgSource = hoverValues && hoverValues.length > 0 ? hoverValues : data;
  const avg = showAverage && avgSource.length > 0
    ? avgSource.reduce((a, b) => a + b, 0) / avgSource.length
    : null;

  return (
    <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2.5 overflow-visible">
      {/* Left: label + value + limit */}
      <div className="shrink-0 min-w-[52px]">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 block leading-tight">{label}</span>
        <span className="text-sm font-mono font-semibold block leading-tight mt-0.5" style={{ color }}>
          {value}
        </span>
        {limit && (
          <span className="text-[9px] text-slate-500 font-mono block leading-tight mt-0.5">
            / {limit}
          </span>
        )}
      </div>
      {/* Center: sparkline */}
      <div className="flex-1 min-w-0 bg-slate-900/60 rounded-lg pt-1 overflow-visible">
        <Sparkline
          data={data}
          timestamps={timestamps}
          hoverValues={hoverValues}
          color={color}
          height={sparklineHeight}
          threshold={threshold}
          className="w-full"
          formatValue={formatValue}
          formatHoverValue={formatHoverValue}
          showAverage={showAverage}
        />
      </div>
      {/* Right: average label outside sparkline */}
      {avg !== null && (
        <div className="shrink-0 text-center min-w-[36px]">
          <span className="text-[9px] uppercase tracking-wider text-slate-500 block leading-tight">{avgLabel || "Avg"}</span>
          <span className="text-[11px] font-mono text-slate-400 block leading-tight mt-0.5">
            {formatAverage ? formatAverage(avg) : `${avg.toFixed(1)}`}
          </span>
        </div>
      )}
    </div>
  );
}
