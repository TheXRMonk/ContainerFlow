import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Server, Wrench, Rocket, Box, Folder } from "lucide-react";

interface GroupNodeData {
  label: string;
  subtitle?: string;
  count?: number;
  [key: string]: unknown;
}

const groupConfig: Record<string, { icon: typeof Server; color: string; borderColor: string }> = {
  INFRA: { icon: Server, color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" },
  DEV: { icon: Wrench, color: "#3b82f6", borderColor: "rgba(59, 130, 246, 0.3)" },
  PROD: { icon: Rocket, color: "#22c55e", borderColor: "rgba(34, 197, 94, 0.3)" },
};

// Rotating colors for project-based groups that don't match known names
const projectColors = [
  { color: "#8b5cf6", borderColor: "rgba(139, 92, 246, 0.3)" },
  { color: "#06b6d4", borderColor: "rgba(6, 182, 212, 0.3)" },
  { color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)" },
  { color: "#ec4899", borderColor: "rgba(236, 72, 153, 0.3)" },
  { color: "#10b981", borderColor: "rgba(16, 185, 129, 0.3)" },
];

let colorIndex = 0;
const assignedColors = new Map<string, (typeof projectColors)[0]>();

function getProjectColor(label: string) {
  if (!assignedColors.has(label)) {
    assignedColors.set(label, projectColors[colorIndex % projectColors.length]!);
    colorIndex++;
  }
  return assignedColors.get(label)!;
}

export const GroupNode = memo(function GroupNode({ data }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  // Label is "PROJECT / COMPOSE" — match compose part for known colors
  const parts = d.label.split(" / ");
  const composePart = parts.length > 1 ? parts[parts.length - 1] : d.label;
  const known = groupConfig[composePart];
  const proj = known ? null : getProjectColor(d.label);
  const config = known || { icon: Folder, color: proj!.color, borderColor: proj!.borderColor };
  const Icon = config.icon;

  return (
    <div className="absolute top-0 left-0 right-0 px-5 py-2.5 flex items-center gap-2.5">
      <Icon size={16} style={{ color: config.color }} />
      <span
        className="text-sm font-semibold tracking-wider uppercase"
        style={{ color: config.color }}
      >
        {d.label}
      </span>
      {d.subtitle && (
        <span className="text-xs text-slate-600 font-mono truncate max-w-[220px]">
          {d.subtitle}
        </span>
      )}
      <div className="flex-1 h-px" style={{ backgroundColor: config.borderColor }} />
      {d.count != null && (
        <div className="flex items-center gap-1.5">
          <Box size={12} style={{ color: config.borderColor }} />
          <span className="text-xs font-mono" style={{ color: config.borderColor }}>
            {d.count}
          </span>
        </div>
      )}
    </div>
  );
});
