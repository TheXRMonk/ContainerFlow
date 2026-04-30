import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, ChevronDown, Check, LogOut, Cpu, MemoryStick } from "lucide-react";
import type { Service, Flow, FlowSettings } from "../../shared/types";
import type { ParticleEngine } from "../engine/particles";
import { FlowPanel } from "../panels/FlowPanel";

interface HeaderBarProps {
  services: Service[];
  filteredServices: Service[];
  connected: boolean;
  token: string;
  projects: string[];
  hiddenProjects: Set<string>;
  onToggleProject: (project: string) => void;
  totalStats: { cpu: number; mem: number };
  flows: Flow[];
  flowSettings: FlowSettings;
  engine: ParticleEngine;
  onSimulate: (flow: Flow) => void;
}

export function HeaderBar({
  services,
  filteredServices,
  connected,
  token,
  projects,
  hiddenProjects,
  onToggleProject,
  totalStats,
  flows,
  flowSettings,
  engine,
  onSimulate,
}: HeaderBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const runningCount = filteredServices.filter((s) => s.state === "running").length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as HTMLElement)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-sm relative z-[9999]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <img
            src="/alteonx-logo.png"
            alt="Flowteon"
            className="w-7 h-7"
            style={{ filter: "brightness(0) saturate(100%) invert(45%) sepia(85%) saturate(2000%) hue-rotate(200deg) brightness(1.1)" }}
          />
          <span className="text-base font-bold text-white tracking-wide">
            Flowteon
          </span>
          <span className="text-xs text-cyan-400 tracking-widest uppercase font-semibold">
            AlteonX
          </span>
        </div>
        <span className="text-xs text-slate-600 font-mono bg-slate-800 px-2 py-0.5 rounded">
          v0.0.1
        </span>

        {/* Total resource usage */}
        {totalStats.cpu > 0 && (
          <div className="flex items-center gap-3 ml-2 text-xs font-mono bg-slate-800/80 border border-slate-700/50 px-3 py-1 rounded-md">
            <div className="flex items-center gap-1.5">
              <Cpu size={12} className="text-cyan-500" />
              <span className="text-cyan-400">{totalStats.cpu.toFixed(1)}%</span>
            </div>
            <div className="w-px h-3 bg-slate-700" />
            <div className="flex items-center gap-1.5">
              <MemoryStick size={12} className="text-violet-500" />
              <span className="text-violet-400">
                {totalStats.mem >= 1024 ? `${(totalStats.mem / 1024).toFixed(1)} GB` : `${totalStats.mem.toFixed(0)} MB`}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-5">
        {/* Flow panel */}
        <FlowPanel
          flows={flows}
          settings={flowSettings}
          engine={engine}
          services={services}
          onSimulate={onSimulate}
        />

        {/* Project filter dropdown */}
        {projects.length > 1 && (
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-md transition-colors"
            >
              Projects
              <span className="text-cyan-400 font-medium">
                {projects.length - hiddenProjects.size}/{projects.length}
              </span>
              <ChevronDown size={14} className={`text-slate-500 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
            </button>
            {filterOpen && (
              <div className="absolute top-full right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 py-1.5 min-w-[200px] z-[9999]">
                {projects.map((p) => {
                  const active = !hiddenProjects.has(p);
                  const count = services.filter((s) => s.project === p).length;
                  return (
                    <button
                      key={p}
                      onClick={() => onToggleProject(p)}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        active ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                      }`}>
                        {active && <Check size={12} className="text-white" />}
                      </div>
                      <span className={active ? "text-slate-200" : "text-slate-500"}>{p}</span>
                      <span className="text-slate-500 ml-auto">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <span className="text-sm text-slate-500">
          <span className="text-emerald-400 font-medium">{runningCount}</span>
          <span className="text-slate-600">/{filteredServices.length}</span>
          <span className="text-slate-600 ml-1">containers</span>
        </span>

        {/* Connection status */}
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi size={15} className="text-emerald-500" />
          ) : (
            <WifiOff size={15} className="text-red-500" />
          )}
          <span className={`text-xs ${connected ? "text-emerald-500" : "text-red-500"}`}>
            {connected ? "Live" : "Offline"}
          </span>
        </div>

        {/* Logout (only if auth is active) */}
        {token && (
          <button
            onClick={() => { localStorage.removeItem("df:token"); window.location.reload(); }}
            className="text-slate-600 hover:text-slate-400 transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
