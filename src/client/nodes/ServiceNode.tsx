import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Database,
  Zap,
  Globe,
  Server,
  Container,
  Shield,
  Cog,
  Timer,
  Radar,
  MonitorDot,
  KeyRound,
  FileCode,
  Boxes,
  Gem,
  Coffee,
  Bug,
  Rabbit,
  Mail,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { Stats } from "../../shared/types";

interface ServiceNodeData {
  label: string;
  image: string;
  state: string;
  ports: { host: number; container: number }[];
  project: string;
  stats: Stats | null;
  flash?: string;
  id?: string;
  particleGlow?: string;
  activeHandles?: string[];
  highlighted?: boolean;
  [key: string]: unknown;
}

const stateStyles: Record<string, { ring: string; dot: string; bg: string; border: string }> = {
  running: { ring: "ring-emerald-500/50", dot: "bg-emerald-500", bg: "bg-emerald-500/10", border: "border-slate-700/80" },
  exited: { ring: "ring-red-500/50", dot: "bg-red-500", bg: "bg-red-500/10", border: "border-red-500/60" },
  paused: { ring: "ring-amber-500/50", dot: "bg-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/60" },
  restarting: { ring: "ring-amber-500/50", dot: "bg-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/60" },
  dead: { ring: "ring-red-500/50", dot: "bg-red-500", bg: "bg-red-500/10", border: "border-red-500/60" },
};

// Map image/name patterns to Lucide icons and colors
const iconMap: { pattern: string; icon: LucideIcon; color: string }[] = [
  { pattern: "postgres", icon: Database, color: "#336791" },
  { pattern: "mysql", icon: Database, color: "#4479A1" },
  { pattern: "mariadb", icon: Database, color: "#003545" },
  { pattern: "mongo", icon: Database, color: "#47A248" },
  { pattern: "redis", icon: Zap, color: "#DC382D" },
  { pattern: "memcached", icon: Zap, color: "#3B9C60" },
  { pattern: "nginx", icon: Globe, color: "#009639" },
  { pattern: "traefik", icon: Globe, color: "#24A1C1" },
  { pattern: "haproxy", icon: Globe, color: "#2E86C1" },
  { pattern: "caddy", icon: Globe, color: "#1F88E5" },
  { pattern: "node", icon: MonitorDot, color: "#339933" },
  { pattern: "python", icon: FileCode, color: "#3776AB" },
  { pattern: "golang", icon: Boxes, color: "#00ADD8" },
  { pattern: "ruby", icon: Gem, color: "#CC342D" },
  { pattern: "java", icon: Coffee, color: "#ED8B00" },
  { pattern: "rabbitmq", icon: Rabbit, color: "#FF6600" },
  { pattern: "kafka", icon: Mail, color: "#231F20" },
  { pattern: "grafana", icon: BarChart3, color: "#F46800" },
  { pattern: "prometheus", icon: BarChart3, color: "#E6522C" },
  { pattern: "certbot", icon: Shield, color: "#003A70" },
];

// Name-based patterns (for custom-built images)
const nameIconMap: { pattern: string; icon: LucideIcon; color: string }[] = [
  { pattern: "collector", icon: Radar, color: "#f59e0b" },
  { pattern: "celery", icon: Cog, color: "#97C95F" },
  { pattern: "worker", icon: Cog, color: "#97C95F" },
  { pattern: "beat", icon: Timer, color: "#97C95F" },
  { pattern: "auth", icon: KeyRound, color: "#8b5cf6" },
  { pattern: "backend", icon: Server, color: "#3b82f6" },
  { pattern: "frontend", icon: MonitorDot, color: "#06b6d4" },
  { pattern: "api", icon: Server, color: "#3b82f6" },
];

function guessIcon(image: string, name: string): { Icon: LucideIcon; color: string } {
  const lowerImage = image.toLowerCase();
  const lowerName = name.toLowerCase();

  // Check image first
  for (const { pattern, icon, color } of iconMap) {
    if (lowerImage.includes(pattern)) return { Icon: icon, color };
  }

  // Then check name
  for (const { pattern, icon, color } of nameIconMap) {
    if (lowerName.includes(pattern)) return { Icon: icon, color };
  }

  return { Icon: Container, color: "#64748b" };
}

export const ServiceNode = memo(function ServiceNode({ data }: NodeProps) {
  const d = data as unknown as ServiceNodeData;
  const s = stateStyles[d.state] || stateStyles.exited;
  const { Icon, color: iconColor } = guessIcon(d.image, d.label);
  const flashClass = d.flash || "";
  const particleGlow = d.particleGlow || "";
  const activeHandles = new Set<string>(d.activeHandles || []);
  const highlighted = d.highlighted;
  const hdot = (id: string) => {
    if (activeHandles.has(id)) {
      return highlighted
        ? "!bg-cyan-400 !w-2 !h-2 !border-0 !opacity-100"
        : "!bg-slate-500 !w-1.5 !h-1.5 !border-0 !opacity-80";
    }
    return "!bg-transparent !w-1.5 !h-1.5 !border-0 !opacity-0";
  };

  // 3 slots per side at 25%, 50%, 75%
  const offsets = ["25%", "50%", "75%"];

  return (
    <div
      title={`${d.label} (${d.state})\nImage: ${d.image}\nID: ${d.id || ""}\nPorts: ${d.ports?.map((p) => `${p.host}:${p.container}`).join(", ") || "none"}`}
      className={`relative rounded-xl border ${s.border} ${s.bg} backdrop-blur-sm
                  shadow-lg shadow-black/30 p-4 min-w-[220px] ring-2 ${particleGlow ? "" : s.ring}
                  transition-all duration-300 ${flashClass}`}
      style={particleGlow ? {
        boxShadow: `0 0 20px ${particleGlow}60, 0 0 40px ${particleGlow}30, inset 0 0 15px ${particleGlow}15`,
        borderColor: particleGlow,
      } : undefined}
    >
      {/* Top handles — left offset, transform centered horizontally */}
      {offsets.map((o, i) => (
        <Handle key={`t${i}`} type="source" position={Position.Top} id={`top-${i}`} className={hdot(`top-${i}`)} style={{ left: o, transform: "translate(-50%, -50%)" }} />
      ))}
      {offsets.map((o, i) => (
        <Handle key={`tt${i}`} type="target" position={Position.Top} id={`top-${i}-target`} className={hdot(`top-${i}`)} style={{ left: o, transform: "translate(-50%, -50%)" }} />
      ))}
      {/* Left handles — top offset, transform centered vertically */}
      {offsets.map((o, i) => (
        <Handle key={`l${i}`} type="source" position={Position.Left} id={`left-${i}`} className={hdot(`left-${i}`)} style={{ top: o, transform: "translate(-50%, -50%)" }} />
      ))}
      {offsets.map((o, i) => (
        <Handle key={`lt${i}`} type="target" position={Position.Left} id={`left-${i}-target`} className={hdot(`left-${i}`)} style={{ top: o, transform: "translate(-50%, -50%)" }} />
      ))}
      {/* Right handles — top offset, transform centered */}
      {offsets.map((o, i) => (
        <Handle key={`r${i}`} type="source" position={Position.Right} id={`right-${i}`} className={hdot(`right-${i}`)} style={{ top: o, transform: "translate(50%, -50%)" }} />
      ))}
      {offsets.map((o, i) => (
        <Handle key={`rt${i}`} type="target" position={Position.Right} id={`right-${i}-target`} className={hdot(`right-${i}`)} style={{ top: o, transform: "translate(50%, -50%)" }} />
      ))}

      {/* Top section: icon left, name + image right */}
      <div className="flex gap-3 mb-2">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 self-center"
          style={{ backgroundColor: `${iconColor}22` }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm truncate">{d.label}</span>
            <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
          </div>
          <div className="text-xs text-slate-500 truncate mt-0.5">
            {d.image.startsWith("sha256:") ? `Sin Tag (${d.image.slice(7, 19)})` : d.image}
          </div>
        </div>
      </div>

      {/* Ports */}
      {d.ports?.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {d.ports.map((p) => (
            <span
              key={`${p.host}:${p.container}`}
              className="text-[11px] bg-slate-800/80 text-cyan-400 px-2 py-0.5 rounded font-mono"
            >
              :{p.host}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      {d.stats && (
        <div className="mt-2 space-y-1.5">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>CPU {d.stats.cpu.toFixed(1)}%</span>
            <span>MEM {d.stats.mem_mb.toFixed(0)}MB</span>
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500/60 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(d.stats.cpu, 100)}%` }}
              />
            </div>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500/60 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(d.stats.mem_percent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom handles — left offset, transform centered */}
      {offsets.map((o, i) => (
        <Handle key={`b${i}`} type="source" position={Position.Bottom} id={`bottom-${i}`} className={hdot(`bottom-${i}`)} style={{ left: o, transform: "translate(-50%, 50%)" }} />
      ))}
      {offsets.map((o, i) => (
        <Handle key={`bt${i}`} type="target" position={Position.Bottom} id={`bottom-${i}-target`} className={hdot(`bottom-${i}`)} style={{ left: o, transform: "translate(-50%, 50%)" }} />
      ))}
    </div>
  );
});
