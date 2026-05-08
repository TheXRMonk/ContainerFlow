import { Database, Zap, Radio, Globe } from "lucide-react";
import { useT } from "../i18n";

const LEGEND_ITEMS = [
  { icon: Database, color: "#336791", label: "Database" },
  { icon: Zap, color: "#F59E0B", label: "Cache" },
  { icon: Radio, color: "#A855F7", label: "Broker" },
  { icon: Globe, color: "#22C55E", label: "Proxy" },
] as const;

export function EdgeLegend() {
  const { t } = useT();

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-5 bg-slate-900/90 border border-slate-800 rounded-lg px-5 py-2.5 z-10">
      <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{t("legend.connections")}</span>
      {LEGEND_ITEMS.map(({ icon: Icon, color, label }) => (
        <div key={label} className="flex items-center gap-2">
          <div className="w-5 h-0.5 rounded-full" style={{ backgroundColor: color }} />
          <Icon size={13} style={{ color }} />
          <span className="text-xs" style={{ color }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
