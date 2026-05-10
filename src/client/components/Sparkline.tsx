import { useRef, useEffect, useState, useCallback } from "react";
import { useT } from "../i18n";

interface SparklineProps {
  data: number[];
  timestamps?: number[];
  hoverValues?: number[];
  width?: number;
  height?: number;
  color?: string;
  threshold?: number;
  showArea?: boolean;
  showAverage?: boolean;
  formatAverage?: (v: number) => string;
  className?: string;
  formatValue?: (v: number) => string;
  formatHoverValue?: (v: number) => string;
}

const PAD = { top: 4, bottom: 0, left: 0, right: 0 };

function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const time = d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${dd}/${mm} ${time}`;
}

export function Sparkline({
  data,
  timestamps,
  hoverValues,
  width: propWidth,
  height: propHeight = 60,
  color = "#06b6d4",
  threshold,
  showArea = true,
  showAverage = false,
  formatAverage,
  className,
  formatValue,
  formatHoverValue,
}: SparklineProps) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: propHeight });

  // Draw the sparkline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = propWidth || dims.w;
    const h = propHeight;
    if (w === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Clip canvas drawing to a rounded rectangle matching the `rounded-lg`
    // (8px radius) of the parent wrapper. This is more robust than relying
    // on CSS overflow:hidden alone — guarantees no fill/stroke leaks past
    // the rounded shape due to subpixel/anti-aliasing artifacts.
    const RADIUS = 8;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(0, 0, w, h, RADIUS);
    } else {
      // Fallback for older browsers
      ctx.moveTo(RADIUS, 0);
      ctx.lineTo(w - RADIUS, 0);
      ctx.quadraticCurveTo(w, 0, w, RADIUS);
      ctx.lineTo(w, h - RADIUS);
      ctx.quadraticCurveTo(w, h, w - RADIUS, h);
      ctx.lineTo(RADIUS, h);
      ctx.quadraticCurveTo(0, h, 0, h - RADIUS);
      ctx.lineTo(0, RADIUS);
      ctx.quadraticCurveTo(0, 0, RADIUS, 0);
    }
    ctx.clip();

    if (data.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("detail.noHistory"), w / 2, h / 2 + 4);
      return;
    }

    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;
    const avg = data.reduce((a, b) => a + b, 0) / data.length;

    // Auto-scale Y to data range with 30% headroom for visual breathing room.
    // Floor at 0.1 (not 1) so values like 0.1% don't get pancaked against the bottom.
    // Threshold is included in the scale ONLY when data is reasonably close to it
    // (≥30% of threshold); otherwise low values would get pancaked at the bottom.
    const dataMax = Math.max(...data);
    let max = Math.max(dataMax * 1.3, 0.1);
    if (threshold !== undefined && threshold > 0 && dataMax >= threshold * 0.3) {
      max = Math.max(max, threshold * 1.1);
    }
    const range = max || 1;
    const xStep = data.length > 1 ? plotW / (data.length - 1) : plotW;

    const toX = (i: number) => PAD.left + i * xStep;
    const toY = (v: number) => PAD.top + plotH - (v / range) * plotH;

    const AMBER = "#f59e0b";
    const hasThreshold = threshold !== undefined && threshold > 0;

    // Helper: pick color based on whether value exceeds threshold
    const segColor = (v: number) => hasThreshold && v >= threshold ? AMBER : color;

    // Helper: interpolate X where data crosses threshold between two points
    const crossX = (i0: number, i1: number) => {
      const v0 = data[i0], v1 = data[i1];
      const t = (threshold! - v0) / (v1 - v0);
      return toX(i0) + t * (toX(i1) - toX(i0));
    };

    // Build segments: groups of consecutive points with the same over/under state
    // Each segment includes the crossing point so lines connect smoothly
    type Seg = { points: { x: number; y: number }[]; over: boolean };
    const segments: Seg[] = [];
    if (data.length > 1 && hasThreshold) {
      let cur: Seg = { points: [{ x: toX(0), y: toY(data[0]) }], over: data[0] >= threshold };
      for (let i = 1; i < data.length; i++) {
        const over = data[i] >= threshold;
        if (over !== cur.over) {
          // Crossing point
          const cx = crossX(i - 1, i);
          const cy = toY(threshold);
          cur.points.push({ x: cx, y: cy });
          segments.push(cur);
          cur = { points: [{ x: cx, y: cy }], over };
        }
        cur.points.push({ x: toX(i), y: toY(data[i]) });
      }
      segments.push(cur);
    }

    // Area fill
    if (showArea && data.length > 1) {
      if (hasThreshold && segments.length > 0) {
        for (const seg of segments) {
          if (seg.points.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(seg.points[0].x, seg.points[0].y);
          for (let j = 1; j < seg.points.length; j++) ctx.lineTo(seg.points[j].x, seg.points[j].y);
          ctx.lineTo(seg.points[seg.points.length - 1].x, PAD.top + plotH);
          ctx.lineTo(seg.points[0].x, PAD.top + plotH);
          ctx.closePath();
          const c = seg.over ? AMBER : color;
          const cr = parseInt(c.slice(1, 3), 16);
          const cg = parseInt(c.slice(3, 5), 16);
          const cb = parseInt(c.slice(5, 7), 16);
          const gradient = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
          gradient.addColorStop(0, `rgba(${cr},${cg},${cb},0.35)`);
          gradient.addColorStop(1, `rgba(${cr},${cg},${cb},0.08)`);
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(data[0]));
        for (let i = 1; i < data.length; i++) ctx.lineTo(toX(i), toY(data[i]));
        ctx.lineTo(toX(data.length - 1), PAD.top + plotH);
        ctx.lineTo(toX(0), PAD.top + plotH);
        ctx.closePath();
        const cr = parseInt(color.slice(1, 3), 16);
        const cg = parseInt(color.slice(3, 5), 16);
        const cb = parseInt(color.slice(5, 7), 16);
        const gradient = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
        gradient.addColorStop(0, `rgba(${cr},${cg},${cb},0.25)`);
        gradient.addColorStop(1, `rgba(${cr},${cg},${cb},0.02)`);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    }

    // Line stroke
    if (data.length > 1) {
      if (hasThreshold && segments.length > 0) {
        for (const seg of segments) {
          if (seg.points.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(seg.points[0].x, seg.points[0].y);
          for (let j = 1; j < seg.points.length; j++) ctx.lineTo(seg.points[j].x, seg.points[j].y);
          ctx.strokeStyle = seg.over ? AMBER : color;
          ctx.lineWidth = 1.5;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(data[0]));
        for (let i = 1; i < data.length; i++) ctx.lineTo(toX(i), toY(data[i]));
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(toX(0), toY(data[0]), 2, 0, Math.PI * 2);
      ctx.fillStyle = segColor(data[0]);
      ctx.fill();
    }

    // Threshold dashed line
    if (hasThreshold) {
      const y = toY(threshold);
      if (y >= PAD.top && y <= PAD.top + plotH) {
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(w - PAD.right, y);
        ctx.strokeStyle = AMBER;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Average dashed line
    if (showAverage && data.length > 1) {
      const avgY = toY(avg);
      if (avgY >= PAD.top && avgY <= PAD.top + plotH) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(PAD.left, avgY);
        ctx.lineTo(w - PAD.right, avgY);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Hover crosshair + dot
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length) {
      const hx = toX(hoverIndex);
      const hy = toY(data[hoverIndex]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hx, PAD.top);
      ctx.lineTo(hx, PAD.top + plotH);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Dot
      const dotColor = hasThreshold && data[hoverIndex] >= threshold ? AMBER : color;
      ctx.beginPath();
      ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
    }
  }, [data, propWidth, propHeight, color, threshold, showArea, showAverage, formatAverage, hoverIndex, dims.w]);

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (data.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const plotW = dims.w - PAD.left - PAD.right;
    const xStep = data.length > 1 ? plotW / (data.length - 1) : plotW;
    const idx = Math.round((mouseX - PAD.left) / xStep);
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setHoverIndex(clamped);
  }, [data.length, dims.w]);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  // ResizeObserver for responsive width — triggers re-draw when container resizes
  useEffect(() => {
    if (propWidth) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setDims((prev) => prev.w !== w ? { ...prev, w } : prev);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [propWidth]);

  // Tooltip content
  const tooltip = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length
    ? {
        value: (() => {
          if (hoverValues && hoverValues[hoverIndex] !== undefined) {
            return formatHoverValue ? formatHoverValue(hoverValues[hoverIndex]) : `${hoverValues[hoverIndex].toFixed(1)}`;
          }
          return formatValue ? formatValue(data[hoverIndex]) : `${data[hoverIndex].toFixed(1)}%`;
        })(),
        time: timestamps && timestamps[hoverIndex] ? formatDateTime(timestamps[hoverIndex]) : null,
        x: PAD.left + (data.length > 1 ? (dims.w - PAD.left - PAD.right) / (data.length - 1) : 0) * hoverIndex,
      }
    : null;

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <div className="overflow-hidden rounded-lg">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="cursor-crosshair block"
        />
      </div>
      {/* Tooltip — below the chart */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: `${Math.max(45, Math.min(tooltip.x, dims.w - 45))}px`,
            bottom: "-22px",
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 shadow-lg whitespace-nowrap flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-semibold" style={{ color }}>{tooltip.value}</span>
            {tooltip.time && (
              <span className="text-[9px] text-slate-400 font-mono">{tooltip.time}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
