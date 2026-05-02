import { Activity, Play, Square, RotateCcw, AlertTriangle } from "lucide-react";
import type { DockerEvent } from "../../shared/types";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function eventIcon(action: string) {
  switch (action) {
    case "start":
      return <Play size={14} className="text-emerald-400" />;
    case "stop":
    case "die":
      return <Square size={14} className="text-red-400" />;
    case "restart":
      return <RotateCcw size={14} className="text-amber-400" />;
    default:
      return <AlertTriangle size={14} className="text-slate-400" />;
  }
}

function actionColor(action: string): string {
  switch (action) {
    case "start": return "text-emerald-400";
    case "stop": case "die": return "text-red-400";
    case "restart": return "text-amber-400";
    default: return "text-slate-400";
  }
}

interface MonitoringPageProps {
  events: DockerEvent[];
}

export function MonitoringPage({ events }: MonitoringPageProps) {
  const sorted = [...events].reverse();

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Activity size={24} className="text-cyan-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Event History</h1>
            <p className="text-sm text-slate-500">Docker container events in real-time</p>
          </div>
        </div>

        {/* Events list */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden">
          {sorted.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              <Activity size={32} className="mx-auto mb-3 opacity-40" />
              <p>No events yet. Events will appear here as containers start, stop, or restart.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/40">
              {sorted.map((ev, i) => (
                <div key={`${ev.service}-${ev.time}-${i}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-700/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center flex-shrink-0">
                    {eventIcon(ev.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-200 font-medium truncate block">{ev.service}</span>
                    <span className={`text-xs font-mono ${actionColor(ev.action)}`}>{ev.action}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono flex-shrink-0">{timeAgo(ev.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alert Rules placeholder */}
        <div className="mt-8 bg-slate-800/30 border border-dashed border-slate-700/60 rounded-xl p-6 text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-500 font-medium">Alert Rules</p>
          <p className="text-xs text-slate-600 mt-1">Configure alerting rules for container events — coming soon</p>
        </div>
      </div>
    </div>
  );
}
