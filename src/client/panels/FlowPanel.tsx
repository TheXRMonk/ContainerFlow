import { useState, useRef, useEffect } from "react";
import { Play, Trash2, ChevronDown, Zap } from "lucide-react";
import type { Flow, FlowSettings } from "../../shared/types";
import type { ParticleEngine } from "../engine/particles";
import type { Service } from "../../shared/types";

interface FlowPanelProps {
  flows: Flow[];
  settings: FlowSettings;
  engine: ParticleEngine;
  services: Service[];
  onSimulate: (flow: Flow) => void;
}

export function FlowPanel({ flows, settings, engine, services, onSimulate }: FlowPanelProps) {
  const [open, setOpen] = useState(false);
  const [particleCount, setParticleCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Update particle count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setParticleCount(engine.count);
    }, 200);
    return () => clearInterval(interval);
  }, [engine]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (flows.length === 0) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-md transition-colors"
      >
        <Play size={14} className="text-cyan-400" />
        Flujos
        {particleCount > 0 && (
          <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full font-mono">
            {particleCount}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 py-1.5 min-w-[240px] z-[9999]">
          <div className="px-3.5 py-2 border-b border-slate-700/50">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
              Simulaciones de Flujo
            </span>
          </div>

          {flows.map((flow) => (
            <button
              key={flow.id}
              onClick={() => onSimulate(flow)}
              className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors group"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: flow.color }}
              />
              <span className="text-slate-200 truncate">{flow.name}</span>
              <Play
                size={12}
                className="text-slate-600 group-hover:text-cyan-400 ml-auto shrink-0 transition-colors"
              />
            </button>
          ))}

          <div className="border-t border-slate-700/50 mt-1 pt-1 flex gap-1 px-2">
            <button
              onClick={() => {
                for (const flow of flows) onSimulate(flow);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-cyan-400 hover:bg-slate-700/60 rounded transition-colors flex-1"
            >
              <Zap size={12} />
              Simular Todo
            </button>
            <button
              onClick={() => {
                engine.clear();
                setParticleCount(0);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-slate-700/60 rounded transition-colors flex-1"
            >
              <Trash2 size={12} />
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
