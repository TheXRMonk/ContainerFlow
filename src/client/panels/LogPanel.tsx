import { useEffect, useRef, useState, useCallback } from "react";
import { X, Pause, Play, Terminal } from "lucide-react";
import type { Service, LogLine, WSMessage } from "../../shared/types";

interface LogPanelProps {
  service: Service;
  logLines: LogLine[];
  token: string;
  onClose: () => void;
  sendMessage: (msg: WSMessage) => void;
  clearLogLines: () => void;
}

export function LogPanel({ service, logLines, token, onClose, sendMessage, clearLogLines }: LogPanelProps) {
  const [initialLogs, setInitialLogs] = useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subscribedRef = useRef<string | null>(null);

  // Fetch initial logs + subscribe to streaming
  useEffect(() => {
    setInitialLogs([]);
    setLoading(true);
    clearLogLines();

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`/api/logs/${service.id}?tail=200`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((lines: LogLine[]) => {
        setInitialLogs(lines);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Subscribe to live logs
    sendMessage({ type: "subscribe_logs", container: service.id });
    subscribedRef.current = service.id;

    return () => {
      if (subscribedRef.current) {
        sendMessage({ type: "unsubscribe_logs" });
        subscribedRef.current = null;
      }
    };
  }, [service.id, token, sendMessage, clearLogLines]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [initialLogs, logLines, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const allLines = [...initialLogs, ...logLines.filter((l) => l.container === service.id)];

  const stateColor =
    service.state === "running" ? "text-emerald-400" :
    service.state === "exited" || service.state === "dead" ? "text-red-400" :
    "text-yellow-400";

  return (
    <div className="log-panel shrink-0 flex flex-col bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/80" style={{ height: "320px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <Terminal size={14} className="text-cyan-400" />
          <span className="text-sm font-medium text-white">{service.name}</span>
          <span className={`text-xs font-mono ${stateColor}`}>{service.state}</span>
          {service.state === "running" && subscribedRef.current && (
            <span className="flex items-center gap-1.5 text-xs text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              streaming
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
            title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
          >
            {autoScroll ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Log body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-xs leading-5 px-4 py-2"
      >
        {loading && (
          <div className="text-slate-500 py-4 text-center">Loading logs...</div>
        )}
        {!loading && allLines.length === 0 && (
          <div className="text-slate-500 py-4 text-center">No logs available</div>
        )}
        {allLines.map((l, i) => (
          <div key={i} className="flex gap-0 hover:bg-slate-800/40">
            {l.timestamp && (
              <span className="text-slate-600 shrink-0 select-none pr-3 whitespace-nowrap">
                {formatTimestamp(l.timestamp)}
              </span>
            )}
            <span className={`whitespace-pre-wrap break-all ${l.stream === "stderr" ? "text-red-400" : "text-slate-300"}`}>
              {l.line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts.slice(11, 19);
  }
}
