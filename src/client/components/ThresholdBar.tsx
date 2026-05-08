import { useRef, useState, useCallback, useEffect } from "react";
import { RotateCw } from "lucide-react";

interface ThresholdBarProps {
  label: string;
  value: number;
  threshold: number;
  isCustom: boolean;
  showThreshold: boolean;
  thresholdLabel: string;
  tagLabel: string;
  hintLabel: string;
  onThresholdChange: (v: number) => void;
  onReset: () => void;
  formatValue: (v: number) => string;
  formatThreshold?: (threshold: number) => string;
  baseColor?: "emerald" | "cyan" | "purple";
}

export function ThresholdBar({ label, value, threshold, isCustom, showThreshold, thresholdLabel, tagLabel, hintLabel, onThresholdChange, onReset, formatValue, formatThreshold, baseColor = "emerald" }: ThresholdBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);

  const calcPercent = useCallback((clientX: number) => {
    if (!barRef.current) return threshold;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    return Math.max(5, Math.min(100, pct));
  }, [threshold]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => { onThresholdChange(calcPercent(e.clientX)); };
    const onUp = () => { setDragging(false); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, calcPercent, onThresholdChange]);

  // Touch support
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: TouchEvent) => { if (e.touches[0]) onThresholdChange(calcPercent(e.touches[0].clientX)); };
    const onEnd = () => { setDragging(false); };
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onEnd);
    return () => { window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd); };
  }, [dragging, calcPercent, onThresholdChange]);

  const baseColorClass = baseColor === "purple" ? "bg-purple-500" : baseColor === "cyan" ? "bg-cyan-500" : "bg-emerald-500";
  const barColor = showThreshold
    ? (value > threshold ? "bg-amber-500" : baseColorClass)
    : (value > 80 ? "bg-amber-500" : baseColorClass);
  const showTooltip = dragging || hovering;

  return (
    <div className="pt-1">
      <div className="flex justify-between text-xs text-slate-500 mb-2.5">
        <span>{label}</span>
        <span>{formatValue(value)}</span>
      </div>
      <div
        ref={barRef}
        className={`relative ${showThreshold ? "h-3" : "h-2"} bg-slate-800 rounded-full group ${showThreshold ? "cursor-pointer" : ""}`}
        onClick={(e) => { if (showThreshold && !dragging) onThresholdChange(calcPercent(e.clientX)); }}
      >
        {/* Usage fill */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
        {/* Threshold handle — only when notifications enabled */}
        {showThreshold && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 select-none touch-none cursor-grab active:cursor-grabbing"
            style={{ left: `${threshold}%` }}
            onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
            onTouchStart={(e) => { e.preventDefault(); setDragging(true); }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            {/* Invisible wider hit area */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-10" />
            {/* Vertical line */}
            <div className={`w-0.5 h-5 rounded-full transition-colors pointer-events-none ${dragging ? "bg-amber-300" : "bg-amber-400/80 group-hover:bg-amber-400"}`} />
            {/* Drag handle diamond */}
            <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 rounded-[1px] border transition-colors pointer-events-none ${
              dragging ? "bg-amber-300 border-amber-200" : "bg-amber-400/90 border-amber-500/50 group-hover:bg-amber-400"
            }`} />
            {/* Tooltip */}
            {showTooltip && (
              <div className={`absolute left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono whitespace-nowrap shadow-lg ${formatThreshold ? "-top-[38px]" : "-top-7"}`}>
                <span className="text-amber-300 block text-center">{threshold}%</span>
                {formatThreshold && <span className="text-slate-400 block text-center text-[9px]">{formatThreshold(threshold)}</span>}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Label row — only when notifications enabled */}
      {showThreshold && (
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-600">{hintLabel}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-slate-600">{tagLabel}</span>
            {isCustom && (
              <button
                onClick={onReset}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Reset to global"
              >
                <RotateCw size={10} />
              </button>
            )}
            <span className="text-[10px] text-amber-400/70 font-mono">{threshold}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
