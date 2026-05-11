import { useEffect, useRef, useState, useCallback, useMemo, startTransition } from "react";
import { X, Pause, Play, Square, RotateCw, Hammer, Trash2, Terminal, Network, Globe, Info as InfoIcon, Activity, Variable, Settings, ChevronUp, ChevronDown, Eye, EyeOff, Copy, Check, Loader2, AlertTriangle, Maximize2, ExternalLink, Pencil, HelpCircle, Save, Lock, RefreshCw } from "lucide-react";
import { Tooltip } from "../components/Tooltip";
import type { Service, Stats, LogLine, WSMessage, Connection, DockerEvent, ContainerSettings, DiscordConfig, StatsRange } from "../../shared/types";
import { useT } from "../i18n";
import { useStatsHistory } from "../hooks/useStatsHistory";
import { StatsCard } from "../components/StatsCard";
import { ThresholdBar } from "../components/ThresholdBar";

type Tab = "info" | "config" | "env" | "stats";

const SYSTEM_ENV_KEYS = new Set([
  "PATH", "HOME", "HOSTNAME", "TERM", "SHLVL", "PWD", "OLDPWD",
  "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "LC_COLLATE",
  "DEBIAN_FRONTEND", "GPG_KEY", "GPG_KEYS",
  "PYTHON_VERSION", "PYTHON_PIP_VERSION", "PYTHON_SETUPTOOLS_VERSION",
  "PYTHON_GET_PIP_URL", "PYTHON_GET_PIP_SHA256", "PYTHON_SHA256",
  "NODE_VERSION", "YARN_VERSION", "NPM_CONFIG_LOGLEVEL",
  "JAVA_HOME", "JAVA_VERSION", "GOPATH", "GOVERSION",
  "PHPIZE_DEPS", "PHP_VERSION", "PHP_INI_DIR",
  "RUBY_VERSION", "GEM_HOME", "BUNDLE_PATH",
  "NGINX_VERSION", "NJS_VERSION",
  "REDIS_VERSION", "REDIS_DOWNLOAD_URL", "REDIS_DOWNLOAD_SHA",
  "PGDATA", "PG_MAJOR", "PG_VERSION", "PG_SHA256",
  "MYSQL_MAJOR", "MYSQL_VERSION", "MYSQL_SHELL_VERSION",
  "MONGO_VERSION", "MONGO_MAJOR", "MONGO_PACKAGE", "MONGO_REPO",
]);

const TAB_KEYS = {
  info: "detail.info",
  stats: "detail.stats",
  env: "detail.env",
  config: "detail.config",
} as const;

const TABS: { id: Tab; icon: typeof InfoIcon }[] = [
  { id: "info", icon: InfoIcon },
  { id: "stats", icon: Activity },
  { id: "env", icon: Variable },
  { id: "config", icon: Settings },
];

interface DetailPanelProps {
  service: Service;
  stats?: Stats;
  logLines: LogLine[];
  token: string;
  closing?: boolean;
  locked?: boolean;
  onClose: () => void;
  onAction: (serviceUid: string, expectedState: Service["state"], minDuration?: number) => void;
  clearProcessing: (uid: string) => void;
  pushActionError: (uid: string, action: string, error: string) => void;
  sendMessage: (msg: WSMessage) => void;
  clearLogLines: () => void;
  connections: Connection[];
  services: Service[];
  getLogsSince: (uid: string) => number | undefined;
  initialLogsFullscreen?: boolean;
  /** Initial tab to open. Used when entering panel via notification/event click. */
  initialTab?: "info" | "config" | "env" | "stats";
  envFiles: Record<string, string>;
  onEnvFileChange: (composeFile: string, envFile: string | null) => void;
  events: DockerEvent[];
  /** Called when container settings change (thresholds, notifications toggle).
   *  Lets the parent (App.tsx) update dashboard ServiceNode threshold coloring live. */
  onContainerSettingsChange?: (uid: string, settings: ContainerSettings) => void;
}

export function DetailPanel({ service, stats, logLines, token, closing, locked, onClose, onAction, clearProcessing, pushActionError, sendMessage, clearLogLines, connections, services, getLogsSince, initialLogsFullscreen, initialTab, envFiles, onEnvFileChange, events, onContainerSettingsChange }: DetailPanelProps) {
  const { t } = useT();
  const [initialLogs, setInitialLogs] = useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subscribedRef = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "info");

  // When the panel opens for a different service (via notification/event click),
  // honor the requested initialTab.
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [service.uid, initialTab]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [envVisibleAll, setEnvVisibleAll] = useState(false);
  const [envVisibleSet, setEnvVisibleSet] = useState<Set<number>>(new Set());
  const [copiedEnvIdx, setCopiedEnvIdx] = useState<number | null>(null);
  const [logsModal, setLogsModal] = useState(!!initialLogsFullscreen);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const [envFileEditing, setEnvFileEditing] = useState(false);
  const [envFileOptions, setEnvFileOptions] = useState<string[]>([]);
  const [envFileSelected, setEnvFileSelected] = useState<string>("");

  // Exec state
  const [execOpen, setExecOpen] = useState(false);
  const [execCmd, setExecCmd] = useState("");
  const [execLoading, setExecLoading] = useState(false);
  const [execResult, setExecResult] = useState<{ output: string; exitCode: number } | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  // Container notification settings
  const [containerSettings, setContainerSettings] = useState<ContainerSettings>({ notificationsEnabled: true, cpuThreshold: null, memThreshold: null });
  const [csLoaded, setCsLoaded] = useState(false);
  const [csSaving, setCsSaving] = useState(false);
  const [csSaved, setCsSaved] = useState(false);
  const [globalThresholds, setGlobalThresholds] = useState<{ cpu: number; mem: number }>({ cpu: 50, mem: 60 });
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [statsRange, setStatsRange] = useState<StatsRange>("1h");
  const { data: historyData, loading: historyLoading } = useStatsHistory(service.uid, statsRange, token);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/container-settings", { headers })
      .then((r) => r.ok ? r.json() : {})
      .then((all: Record<string, ContainerSettings>) => {
        if (all[service.uid]) setContainerSettings(all[service.uid]);
        setCsLoaded(true);
      })
      .catch(() => setCsLoaded(true));
    fetch("/api/discord-config", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((cfg: DiscordConfig | null) => {
        if (cfg) {
          setGlobalThresholds({ cpu: cfg.thresholds.cpuPercent, mem: cfg.thresholds.memPercent });
          setDiscordEnabled(cfg.enabled && !!cfg.webhookUrl);
        }
      })
      .catch(() => {});
  }, [service.uid, token]);

  // Auto-save container settings on change (debounced)
  const csLoadedRef = useRef(false);
  useEffect(() => {
    if (!csLoaded) return;
    // Skip the first render after loading
    if (!csLoadedRef.current) { csLoadedRef.current = true; return; }
    const timer = setTimeout(async () => {
      setCsSaving(true);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        await fetch("/api/container-settings", {
          method: "PUT",
          headers,
          body: JSON.stringify({ uid: service.uid, settings: containerSettings }),
        });
        setCsSaved(true);
        setTimeout(() => setCsSaved(false), 1500);
        // Notify parent so dashboard ServiceNode thresholds update live
        onContainerSettingsChange?.(service.uid, containerSettings);
      } catch {}
      setCsSaving(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [containerSettings, csLoaded, service.uid, token, onContainerSettingsChange]);

  // Scroll modal to bottom when opened or when logs arrive
  useEffect(() => {
    if (logsModal && modalScrollRef.current) {
      modalScrollRef.current.scrollTop = modalScrollRef.current.scrollHeight;
    }
  }, [logsModal, initialLogs, logLines]);
  const isProcessing = (service.state as string) === "processing";
  const processingStartedAt = (service as any)._processingStartedAt as number | undefined;
  const [elapsed, setElapsed] = useState(0);
  const prevProcessingRef = useRef(false);
  const actionTimestampRef = useRef<number | null>(null);

  // Timer for processing counter
  useEffect(() => {
    if (!isProcessing || !processingStartedAt) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - processingStartedAt) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - processingStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isProcessing, processingStartedAt]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<"stop" | "restart" | "rebuild" | "recreate" | "remove" | null>(null);

  const executeAction = useCallback(async (action: "stop" | "start" | "restart" | "rebuild" | "recreate" | "remove") => {
    setActionLoading(action);
    setActionResult(null);
    setConfirmAction(null);
    actionTimestampRef.current = Math.floor(Date.now() / 1000);

    // Optimistic processing — set BEFORE fetch
    const expectedState: Service["state"] =
      action === "stop" || action === "remove" ? "exited" :
      action === "start" || action === "restart" || action === "rebuild" || action === "recreate" ? "running" :
      service.state;
    const minDuration = action === "restart" ? 2000 : (action === "rebuild" || action === "recreate") ? 3000 : 0;
    onAction(service.uid, expectedState, minDuration);
    setInitialLogs([]);
    clearLogLines();
    // Unsubscribe log stream to prevent stale lines during the action
    sendMessage({ type: "unsubscribe_logs" });
    subscribedRef.current = null;

    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/containers/${service.id}/${action}`, { method: "POST", headers });
      const data = await res.json();
      if (res.ok) {
        setActionResult({ type: "success", message: `${action} ${t("detail.actionSuccess")}` });
        if (action === "remove") {
          setTimeout(() => handleClose(), 1000);
        }
      } else {
        clearProcessing(service.uid);
        const errMsg = data.error || `${t("detail.actionFailed")} ${action}`;
        setActionResult({ type: "error", message: errMsg });
        pushActionError(service.uid, action, errMsg);
      }
    } catch (err: any) {
      clearProcessing(service.uid);
      const errMsg = err?.message || `${t("detail.actionFailed")} ${action}`;
      setActionResult({ type: "error", message: errMsg });
      pushActionError(service.uid, action, errMsg);
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionResult(null), 3000);
    }
  }, [service.id, service.uid, token, onAction, clearProcessing, pushActionError, sendMessage, clearLogLines, t]);

  const runExec = useCallback(async () => {
    if (!execCmd.trim()) return;
    setExecLoading(true);
    setExecResult(null);
    setExecError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/containers/${service.id}/exec`, {
        method: "POST",
        headers,
        body: JSON.stringify({ cmd: execCmd }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setExecResult({ output: data.output, exitCode: data.exitCode });
      } else {
        setExecError(data.error || "Exec failed");
      }
    } catch {
      setExecError("Network error");
    } finally {
      setExecLoading(false);
    }
  }, [execCmd, service.id, token]);

  // Re-subscribe logs when exiting processing state
  useEffect(() => {
    const wasProcessing = prevProcessingRef.current;
    prevProcessingRef.current = isProcessing;
    if (wasProcessing && !isProcessing) {
      // Service just finished processing — re-fetch logs (only new ones since the action)
      setInitialLogs([]);
      clearLogLines();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const since = actionTimestampRef.current;
      fetch(`/api/logs/${service.id}?tail=200&since=${since || Math.floor(Date.now() / 1000)}`, { headers })
        .then((r) => r.ok ? r.json() : [])
        .then((lines: LogLine[]) => setInitialLogs(lines))
        .catch(() => {});
      sendMessage({ type: "subscribe_logs", container: service.id });
    }
  }, [isProcessing, service.state, service.id, token, sendMessage, clearLogLines]);

  // Slide-in animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // React to external close (pane click)
  useEffect(() => {
    if (closing) setVisible(false);
  }, [closing]);

  // Slide-out + zoom-out in parallel
  const handleClose = useCallback(() => {
    setVisible(false);
    onClose();
  }, [onClose]);

  // Fetch initial logs + subscribe
  useEffect(() => {
    setInitialLogs([]);
    setLoading(true);
    clearLogLines();
    initialScrollDone.current = false;

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const since = getLogsSince(service.uid);
    const sinceParam = since ? `&since=${since}` : "";
    fetch(`/api/logs/${service.id}?tail=200${sinceParam}`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((lines: LogLine[]) => {
        setInitialLogs(lines);
        setLoading(false);
      })
      .catch(() => setLoading(false));

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
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    programmaticScroll.current = true;
    // Instant scroll until initial logs are loaded, then smooth
    if (!initialScrollDone.current && initialLogs.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      initialScrollDone.current = true;
    } else if (initialScrollDone.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [initialLogs, logLines, autoScroll]);

  const programmaticScroll = useRef(false);
  const manualPause = useRef(false);
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    if (programmaticScroll.current) { programmaticScroll.current = false; return; }
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 5;
    if (manualPause.current) {
      // Only clear manual pause when user scrolls exactly to bottom
      if (atBottom) { manualPause.current = false; setAutoScroll(true); }
      return;
    }
    setAutoScroll((prev) => prev === atBottom ? prev : atBottom);
  }, []);

  // Docker events as special log lines (only show events since last action, or all if no action)
  const eventLogLines = useMemo(() => {
    const sinceTs = actionTimestampRef.current;
    return events
      .filter((e) => e.service === service.uid && (!sinceTs || e.time >= sinceTs))
      .map((e): LogLine => ({
        container: service.id,
        line: `[DOCKER] Container ${e.action}`,
        timestamp: new Date(e.time * 1000).toISOString(),
        stream: "stderr",
      }));
  }, [events, service.uid, service.id]);

  const allLines = useMemo(() => {
    const combined = [...initialLogs, ...logLines, ...eventLogLines];
    combined.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
    return combined;
  }, [initialLogs, logLines, eventLogLines]);

  const connectedSvcs = useMemo(() => {
    const connectedUids = new Set<string>();
    for (const c of connections) {
      if (c.from === service.uid) connectedUids.add(c.to);
      if (c.to === service.uid) connectedUids.add(c.from);
    }
    return services.filter((s) => connectedUids.has(s.uid));
  }, [connections, services, service.uid]);

  const isCrashed = (service.state as string) === "crashed";
  const stateColor = isProcessing ? "text-yellow-400" :
    isCrashed ? "text-orange-400" :
    service.state === "running" ? "text-emerald-400" :
    service.state === "exited" || service.state === "dead" ? "text-red-400" :
    "text-yellow-400";

  const stateDot = isProcessing ? "bg-yellow-400 animate-pulse" :
    isCrashed ? "bg-orange-400" :
    service.state === "running" ? "bg-emerald-400" :
    service.state === "exited" || service.state === "dead" ? "bg-red-400" :
    "bg-yellow-400";

  return (
    <div
      className={`absolute top-0 left-0 bottom-0 w-[900px] bg-slate-900/95 backdrop-blur-sm border-r border-slate-700/60 flex flex-col z-50 rounded-l-xl transition-transform duration-[400ms] ease-out ${visible ? "translate-x-0" : "-translate-x-full"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${stateDot}`} />
          <span className="text-sm font-semibold text-white truncate">{service.name}</span>
          {locked && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-700/60 border border-slate-600/50 rounded" title={t("access.viewOnly")}>
              <Lock size={10} />
              {t("access.viewOnly")}
            </span>
          )}
          {service.ports.length > 0 && service.state === "running" && (
            <a
              href={`http://${window.location.hostname}:${service.ports[0].host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-slate-500 hover:text-cyan-400 transition-colors"
              title={`Open http://${window.location.hostname}:${service.ports[0].host}`}
            >
              <ExternalLink size={12} />
              <span className="text-[11px] font-mono">:{service.ports[0].host}</span>
            </a>
          )}
          <span className={`text-xs font-mono ${stateColor} flex items-center gap-1`}>
            {isProcessing ? `processing... ${elapsed}s` :
             isCrashed ? <><AlertTriangle size={11} />crashed (exit {service.exit_code}{service.oom_killed ? ", OOM" : ""})</> :
             service.state}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Action buttons */}
          {isProcessing ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-yellow-400">
              <Loader2 size={12} className="animate-spin" />
              {t("detail.processing")}
            </div>
          ) : (
            <>
              {service.compose_file && (
                <>
                  <button
                    onClick={() => setConfirmAction("recreate")}
                    disabled={!!actionLoading || locked}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "recreate" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {t("actions.recreate")}
                  </button>
                  <button
                    onClick={() => setConfirmAction("rebuild")}
                    disabled={!!actionLoading || locked}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "rebuild" ? <Loader2 size={12} className="animate-spin" /> : <Hammer size={12} />}
                    {t("actions.rebuild")}
                  </button>
                </>
              )}
              {service.state === "running" ? (
                <>
                  <button
                    onClick={() => setConfirmAction("restart")}
                    disabled={!!actionLoading || locked}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-yellow-400 hover:bg-yellow-400/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "restart" ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                    {t("actions.restart")}
                  </button>
                  <button
                    onClick={() => setConfirmAction("stop")}
                    disabled={!!actionLoading || locked}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "stop" ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                    {t("actions.stop")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmAction("remove")}
                    disabled={!!actionLoading || locked}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "remove" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    {t("actions.remove")}
                  </button>
                  <button
                    onClick={() => executeAction("start")}
                    disabled={!!actionLoading || locked}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-40 ${
                      isCrashed ? "text-orange-400 hover:bg-orange-400/10" : "text-emerald-400 hover:bg-emerald-400/10"
                    }`}
                  >
                    {actionLoading === "start" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    {isCrashed ? t("actions.retry") : t("actions.start")}
                  </button>
                </>
              )}
            </>
          )}

          <div className="w-px h-4 bg-slate-700 mx-1" />
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
            title={t("detail.close")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="px-4 py-2.5 bg-slate-800/90 border-b border-slate-700/60 flex items-center gap-3 shrink-0">
          <AlertTriangle size={14} className={`shrink-0 ${
            confirmAction === "stop" || confirmAction === "remove" ? "text-red-400" :
            confirmAction === "rebuild" || confirmAction === "recreate" ? "text-cyan-400" :
            "text-yellow-400"
          }`} />
          <span className="text-xs text-slate-300 flex-1 flex items-center gap-1.5">
            {confirmAction === "stop" ? t("detail.confirmStop") :
             confirmAction === "restart" ? t("detail.confirmRestart") :
             confirmAction === "remove" ? t("detail.confirmRemove") :
             confirmAction === "recreate" ? t("detail.confirmRecreate") :
             t("detail.confirmRebuild")}
            <Tooltip text={t(`actions.${confirmAction}.tooltip` as any)} width="w-72" placement="bottom" />
          </span>
          <button
            onClick={() => executeAction(confirmAction)}
            className={`px-3 py-1 rounded text-[11px] font-medium text-white transition-colors ${
              confirmAction === "stop" || confirmAction === "remove" ? "bg-red-700 hover:bg-red-600" :
              confirmAction === "rebuild" || confirmAction === "recreate" ? "bg-cyan-700 hover:bg-cyan-600" :
              "bg-yellow-700 hover:bg-yellow-600"
            }`}
          >
            {confirmAction === "stop" ? t("actions.stop") :
             confirmAction === "restart" ? t("actions.restart") :
             confirmAction === "remove" ? t("actions.remove") :
             confirmAction === "recreate" ? t("actions.recreate") :
             t("actions.rebuild")}
          </button>
          <button
            onClick={() => setConfirmAction(null)}
            className="px-3 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors"
          >
            {t("detail.cancel")}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-800 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setLogsExpanded(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium relative transition-colors ${
                isActive ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={12} />
              {t(TAB_KEYS[tab.id])}
              <span className={`absolute bottom-0 left-0 right-0 h-px bg-cyan-400 transition-transform duration-300 ease-out origin-center ${isActive ? "scale-x-100" : "scale-x-0"}`} />
            </button>
          );
        })}
      </div>

      {/* Tab content + Logs below */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Tab content area */}
        <div style={{ flexBasis: logsExpanded ? "0px" : "75%", flexShrink: 0, transition: "flex-basis 300ms ease-in-out, padding 300ms ease-in-out" }} className={`overflow-hidden ${logsExpanded ? "" : "overflow-y-auto"}`}>
          {/* Info tab */}
          {activeTab === "info" && (
            <div className="px-4 py-3 space-y-3">
              {/* Crash banner */}
              {isCrashed && (
                <div className="flex items-start gap-2.5 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2.5">
                  <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-orange-300">{t("detail.containerCrashed")}</div>
                    <div className="text-slate-400">
                      {t("detail.exitCode")}: <span className="text-orange-300 font-mono">{service.exit_code}</span>
                      {service.oom_killed && <span className="ml-2 text-red-400 font-semibold">{t("detail.oomKilled")}</span>}
                      {service.restart_count > 0 && <span className="ml-2">{t("detail.restarted")} <span className="text-orange-300 font-mono">{service.restart_count}</span> {t("detail.times")}</span>}
                    </div>
                    <div className="text-slate-500">{t("detail.checkLogs")}</div>
                  </div>
                </div>
              )}
              {/* Warning banners */}
              {service.memory_limit === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  {t("detail.noMemoryLimit")}
                </div>
              )}
              {service.cpu_quota === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  {t("detail.noCpuLimit")}
                </div>
              )}
              {(service.restart_policy === "no" || service.restart_policy === "") && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  {t("detail.weakRestartPolicy")}
                </div>
              )}
              {service.status && (
                <DetailRow label={t("detail.status")} value={service.status} />
              )}
              <DetailRow label={t("detail.image")} value={service.image} mono />
              <DetailRow label={t("detail.container")} value={service.id.slice(0, 12)} mono />
              <DetailRow label={t("detail.project")} value={service.project} />
              {service.compose_file && (
                <DetailRow label={t("detail.compose")} value={service.compose_file} mono />
              )}

              {service.compose_file && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1">
                    {t("detail.envFile")}
                    <span className="relative group/tip">
                      <HelpCircle size={11} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                      <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 px-2.5 py-1.5 bg-slate-700 text-slate-200 text-[11px] normal-case tracking-normal rounded-md shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-10">
                        {t("detail.envFileTip")}
                      </span>
                    </span>
                  </span>
                  {envFileEditing ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={envFileSelected}
                        onChange={(e) => setEnvFileSelected(e.target.value)}
                        className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">{t("detail.envFileAutoDetect")}</option>
                        {envFileOptions.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          onEnvFileChange(service.compose_file!, envFileSelected || null);
                          setEnvFileEditing(false);
                        }}
                        className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEnvFileEditing(false)}
                        className="p-1 rounded text-slate-400 hover:bg-slate-700 transition-colors"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm break-all ${envFiles[service.compose_file!] ? "font-mono text-slate-200" : "text-slate-500 italic"}`}>
                        {envFiles[service.compose_file!] || t("detail.envFileAuto")}
                      </span>
                      <button
                        onClick={() => {
                          setEnvFileSelected(envFiles[service.compose_file!] || "");
                          const headers: Record<string, string> = {};
                          if (token) headers["Authorization"] = `Bearer ${token}`;
                          fetch(`/api/env-files/detect/${service.id}`, { headers })
                            .then((r) => r.ok ? r.json() : { files: [] })
                            .then((data: { files: string[] }) => setEnvFileOptions(data.files))
                            .catch(() => setEnvFileOptions([]));
                          setEnvFileEditing(true);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                        title="Edit env file"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {service.ports.length > 0 && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1">{t("detail.ports")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {service.ports.map((p, i) => (
                      <a
                        key={i}
                        href={`http://${window.location.hostname}:${p.host}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-mono bg-slate-800/80 text-cyan-300 px-2.5 py-1 rounded hover:bg-slate-700/80 hover:text-cyan-200 transition-colors cursor-pointer"
                        title={`Open http://${window.location.hostname}:${p.host}`}
                      >
                        <Globe size={13} className="text-slate-500" />
                        {p.host} → {p.container}
                        <ExternalLink size={11} className="text-slate-500" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {service.networks.length > 0 && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1">{t("detail.networks")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {service.networks.map((n, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 text-sm font-mono bg-slate-800/80 text-purple-300 px-2.5 py-1 rounded">
                        <Network size={13} className="text-slate-500" />
                        {n}
                        {service.network_ips?.[n] && (
                          <span className="text-slate-500 ml-1">{service.network_ips[n]}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Volumes / Mounts */}
              {service.mounts && service.mounts.length > 0 && (
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1">{t("detail.mounts")}</span>
                  <div className="space-y-1.5">
                    {service.mounts.map((m, i) => {
                      const typeColor = m.type === "volume" ? "text-emerald-400 bg-emerald-500/10"
                        : m.type === "bind" ? "text-cyan-400 bg-cyan-500/10"
                        : "text-amber-400 bg-amber-500/10";
                      return (
                        <div key={i} className="bg-slate-800/60 border border-slate-700/40 rounded px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${typeColor}`}>{m.type}</span>
                            <span className="text-xs font-mono text-slate-200 truncate flex-1" title={m.destination}>{m.destination}</span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${m.rw ? "text-slate-400 bg-slate-700/60" : "text-amber-300 bg-amber-500/15"}`}>
                              {m.rw ? "rw" : "ro"}
                            </span>
                          </div>
                          {m.name && (
                            <div className="text-[10px] text-slate-400 font-mono pl-1 truncate" title={m.name}>
                              <span className="text-slate-600">name:</span> {m.name}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 font-mono pl-1 truncate" title={m.source}>
                            <span className="text-slate-600">←</span> {m.source}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Connected services */}
              {connectedSvcs.length > 0 && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1">{t("detail.connectedTo")}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {connectedSvcs.map((s) => {
                        const dotColor = s.state === "running" ? "bg-emerald-400" : s.state === "exited" || s.state === "dead" ? "bg-red-400" : "bg-yellow-400";
                        return (
                          <span key={s.uid} className="inline-flex items-center gap-1.5 text-sm bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                            {s.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
              )}
            </div>
          )}

        {/* Config tab */}
        {activeTab === "config" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* Restart policy */}
            {service.restart_policy && (
              <DetailRow label={t("detail.restartPolicy")} value={service.restart_policy} />
            )}

            {/* Resource limits */}
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1">{t("detail.resourceLimits")}</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/80 rounded px-3 py-2">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 block">{t("detail.memoryLimit")}</span>
                  <span className="text-xs font-mono text-slate-200">
                    {service.memory_limit > 0
                      ? `${(service.memory_limit / 1024 / 1024).toFixed(0)} MB`
                      : t("detail.unlimited")}
                  </span>
                </div>
                <div className="bg-slate-800/80 rounded px-3 py-2">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 block">{t("detail.cpuQuota")}</span>
                  <span className="text-xs font-mono text-slate-200">
                    {service.cpu_quota > 0
                      ? `${(service.cpu_quota / 1000).toFixed(0)}%`
                      : t("detail.unlimited")}
                  </span>
                </div>
              </div>
            </div>

            {/* Health check */}
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1">{t("detail.healthCheck")}</span>
              {service.health_status ? (
                <div className="space-y-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded ${
                    service.health_status === "healthy" ? "bg-emerald-900/40 text-emerald-400" :
                    service.health_status === "unhealthy" ? "bg-red-900/40 text-red-400" :
                    "bg-yellow-900/40 text-yellow-400"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      service.health_status === "healthy" ? "bg-emerald-400" :
                      service.health_status === "unhealthy" ? "bg-red-400" :
                      "bg-yellow-400"
                    }`} />
                    {service.health_status}
                  </span>
                  {service.health_log.length > 0 && (
                    <div className="bg-slate-800/60 rounded p-2 space-y-0.5">
                      <span className="text-[10px] text-slate-500 block mb-1">{t("detail.recentChecks")}</span>
                      {service.health_log.map((entry, i) => (
                        <div key={i} className="text-[11px] font-mono text-slate-400 break-all">{entry}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500">{t("detail.healthNotConfigured")}</span>
              )}
            </div>
          </div>
        )}

        {/* Env tab */}
        {activeTab === "env" && (() => {
          const filteredEnv = (service.env || []).filter((entry) => {
            const key = entry.split("=")[0];
            return !SYSTEM_ENV_KEYS.has(key);
          });
          return (
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">{filteredEnv.length} {t("detail.variables")}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const text = filteredEnv.join("\n");
                    try {
                      navigator.clipboard.writeText(text);
                    } catch {
                      const ta = document.createElement("textarea");
                      ta.value = text;
                      ta.style.position = "fixed";
                      ta.style.opacity = "0";
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand("copy");
                      document.body.removeChild(ta);
                    }
                    setCopiedEnvIdx(-1);
                    setTimeout(() => setCopiedEnvIdx(null), 1500);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  {copiedEnvIdx === -1 ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  {copiedEnvIdx === -1 ? t("detail.copied") : t("detail.copyAll")}
                </button>
                <button
                  onClick={() => { setEnvVisibleAll((v) => !v); setEnvVisibleSet(new Set()); }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  {envVisibleAll ? <EyeOff size={11} /> : <Eye size={11} />}
                  {envVisibleAll ? t("detail.hideAll") : t("detail.showAll")}
                </button>
              </div>
            </div>
            {filteredEnv.length > 0 ? (
              <div className="space-y-0.5">
                {filteredEnv.map((entry, i) => {
                  const eqIdx = entry.indexOf("=");
                  const key = eqIdx >= 0 ? entry.slice(0, eqIdx) : entry;
                  const val = eqIdx >= 0 ? entry.slice(eqIdx + 1) : "";
                  return (
                    <div key={i} className="group flex items-center gap-0 font-mono text-xs py-1.5 hover:bg-slate-800/40 rounded px-1">
                      {(() => {
                        const isVisible = envVisibleAll || envVisibleSet.has(i);
                        return (
                          <>
                            <span className="text-cyan-400 shrink-0">{key}</span>
                            <span className="text-slate-600 mx-1">=</span>
                            <span className={`break-all flex-1 ${isVisible ? "text-slate-300" : "text-slate-600 select-none"}`}>
                              {isVisible ? val : "••••••••"}
                            </span>
                            <button
                              onClick={() => setEnvVisibleSet((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i); else next.add(i);
                                return next;
                              })}
                              className="shrink-0 ml-2 p-1 rounded opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 transition-opacity"
                              title={isVisible ? "Hide" : "Show"}
                            >
                              {isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                            <button
                              onClick={() => {
                                try {
                                  navigator.clipboard.writeText(entry);
                                } catch {
                                  // Fallback for non-HTTPS
                                  const ta = document.createElement("textarea");
                                  ta.value = entry;
                                  ta.style.position = "fixed";
                                  ta.style.opacity = "0";
                                  document.body.appendChild(ta);
                                  ta.select();
                                  document.execCommand("copy");
                                  document.body.removeChild(ta);
                                }
                                setCopiedEnvIdx(i);
                                setTimeout(() => setCopiedEnvIdx(null), 1500);
                              }}
                              className="shrink-0 ml-1 p-1 rounded opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 transition-opacity"
                              title="Copy"
                            >
                              {copiedEnvIdx === i ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-500 text-sm text-center py-8">{t("detail.noEnvVars")}</div>
            )}
          </div>
          );
        })()}

        {/* Stats tab */}
        {activeTab === "stats" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Warning banners */}
            {service.memory_limit === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                {t("detail.noMemoryLimit")}
              </div>
            )}
            {service.cpu_quota === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                {t("detail.noCpuLimit")}
              </div>
            )}
            {(service.restart_policy === "no" || service.restart_policy === "") && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                {t("detail.weakRestartPolicy")}
              </div>
            )}

            {/* Notifications toggle */}
            {csLoaded && (
              <div className="flex items-center justify-between">
                <span className={`text-xs ${discordEnabled ? "text-slate-300" : "text-slate-500"}`}>{t("detail.notifications")}</span>
                <button
                  type="button"
                  disabled={!discordEnabled}
                  onClick={() => { if (discordEnabled) setContainerSettings((s) => ({ ...s, notificationsEnabled: !s.notificationsEnabled })); }}
                  className={`relative w-9 h-5 rounded-full transition-colors ${!discordEnabled ? "bg-slate-700 opacity-50 cursor-not-allowed" : containerSettings.notificationsEnabled ? "bg-cyan-600" : "bg-slate-600"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${discordEnabled && containerSettings.notificationsEnabled ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </div>
            )}

            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <StatCard
                    label={t("node.cpu")}
                    value={`${stats.cpu.toFixed(1)}%`}
                    color={stats.cpu > (discordEnabled && containerSettings.notificationsEnabled ? (containerSettings.cpuThreshold ?? globalThresholds.cpu) : 80) ? "text-amber-400" : "text-cyan-400"}
                    limit={service.cpu_quota > 0 ? `${(service.cpu_quota / 1000).toFixed(0)}%` : undefined}
                    threshold={discordEnabled && containerSettings.notificationsEnabled ? `${containerSettings.cpuThreshold ?? globalThresholds.cpu}%` : undefined}
                    thresholdLabel={t("detail.threshold")}
                    limitLabel={t("detail.limit")}
                    thresholdTooltip={t("detail.thresholdTooltip")}
                    limitTooltip={t("detail.limitTooltip")}
                  />
                  <StatCard
                    label={t("detail.memory")}
                    value={`${stats.mem_mb.toFixed(0)} MB`}
                    extra={`${stats.mem_percent.toFixed(1)}%`}
                    color={stats.mem_percent > (discordEnabled && containerSettings.notificationsEnabled ? (containerSettings.memThreshold ?? globalThresholds.mem) : 80) ? "text-amber-400" : "text-purple-400"}
                    limit={service.memory_limit > 0 ? `${(service.memory_limit / 1024 / 1024).toFixed(0)} MB` : undefined}
                    threshold={discordEnabled && containerSettings.notificationsEnabled ? `${containerSettings.memThreshold ?? globalThresholds.mem}%` : undefined}
                    thresholdLabel={t("detail.threshold")}
                    limitLabel={t("detail.limit")}
                    thresholdTooltip={t("detail.thresholdTooltip")}
                    limitTooltip={t("detail.limitTooltip")}
                    valueTooltip={stats.mem_breakdown ? formatMemTooltip(stats.mem_breakdown, t) : undefined}
                  />
                </div>

                {/* CPU bar with draggable threshold */}
                <ThresholdBar
                  label={t("detail.cpuUsage")}
                  value={stats.cpu}
                  threshold={containerSettings.cpuThreshold ?? globalThresholds.cpu}
                  isCustom={containerSettings.cpuThreshold !== null}
                  showThreshold={discordEnabled && containerSettings.notificationsEnabled}
                  thresholdLabel={t("detail.cpuThreshold")}
                  tagLabel={containerSettings.cpuThreshold !== null ? t("detail.custom") : t("detail.global")}
                  hintLabel={t("detail.thresholdHint")}
                  onThresholdChange={(v) => setContainerSettings((s) => ({ ...s, cpuThreshold: v }))}
                  onReset={() => setContainerSettings((s) => ({ ...s, cpuThreshold: null }))}
                  formatValue={(v) => `${v.toFixed(1)}%`}
                  baseColor="cyan"
                />

                {/* Memory bar with draggable threshold — extra top margin for drag handle clearance */}
                <div className="mt-2" />
                <ThresholdBar
                  label={t("detail.memoryUsage")}
                  value={stats.mem_percent}
                  threshold={containerSettings.memThreshold ?? globalThresholds.mem}
                  isCustom={containerSettings.memThreshold !== null}
                  showThreshold={discordEnabled && containerSettings.notificationsEnabled}
                  thresholdLabel={t("detail.memThreshold")}
                  tagLabel={containerSettings.memThreshold !== null ? t("detail.custom") : t("detail.global")}
                  hintLabel={t("detail.thresholdHint")}
                  onThresholdChange={(v) => setContainerSettings((s) => ({ ...s, memThreshold: v }))}
                  onReset={() => setContainerSettings((s) => ({ ...s, memThreshold: null }))}
                  formatValue={() => `${stats.mem_mb.toFixed(0)} MB (${stats.mem_percent.toFixed(1)}%)`}
                  formatThreshold={service.memory_limit > 0 ? (th) => `${((th / 100) * service.memory_limit / 1024 / 1024).toFixed(0)} MB` : undefined}
                  baseColor="purple"
                />
              </>
            ) : (
              <div className="text-slate-500 text-sm text-center py-8">{t("detail.noStats")}</div>
            )}

            {/* History sparklines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">{t("detail.cpuHistory")}</span>
                <div className="flex gap-0.5">
                  {(["1h", "6h", "24h", "7d"] as StatsRange[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setStatsRange(r)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                        statsRange === r
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {historyLoading ? (
                <div className="text-slate-500 text-[11px] text-center py-4">{t("detail.loadingHistory")}</div>
              ) : (
                <div className="space-y-2">
                  <StatsCard
                    label="CPU"
                    value={stats ? `${stats.cpu.toFixed(1)}%` : "—"}
                    limit={service.cpu_quota > 0 ? `${(service.cpu_quota / 1000).toFixed(0)}%` : undefined}
                    data={historyData.map((p) => p.cpu)}
                    timestamps={historyData.map((p) => p.timestamp)}
                    hoverValues={historyData.map((p) => p.cpu)}
                    color="#06b6d4"
                    threshold={discordEnabled && containerSettings.notificationsEnabled ? (containerSettings.cpuThreshold ?? globalThresholds.cpu) : undefined}
                    sparklineHeight={60}
                    formatHoverValue={(v) => `${v.toFixed(2)}%`}
                    showAverage
                    formatAverage={(v) => `${v.toFixed(2)}%`}
                    avgLabel={t("detail.avg")}
                  />
                  <StatsCard
                    label="MEM"
                    value={stats ? `${stats.mem_mb.toFixed(0)} MB` : "—"}
                    limit={service.memory_limit > 0 ? `${(service.memory_limit / 1024 / 1024).toFixed(0)} MB` : undefined}
                    data={historyData.map((p) => p.mem_percent)}
                    timestamps={historyData.map((p) => p.timestamp)}
                    hoverValues={historyData.map((p) => p.mem_mb)}
                    color="#a78bfa"
                    threshold={discordEnabled && containerSettings.notificationsEnabled ? (containerSettings.memThreshold ?? globalThresholds.mem) : undefined}
                    sparklineHeight={60}
                    formatHoverValue={(v) => `${v.toFixed(0)} MB`}
                    showAverage
                    formatAverage={(v) => `${v.toFixed(0)} MB`}
                    avgLabel={t("detail.avg")}
                  />
                </div>
              )}
            </div>

          </div>
        )}

        </div>

        {/* Logs section — always visible at bottom */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Expand/collapse divider */}
          <div className="relative shrink-0">
            <div className="border-t border-slate-700/60" />
            <div className="absolute inset-x-0 -top-3 flex justify-center">
              <button
                onClick={() => {
                  setLogsExpanded((v) => !v);
                  // Scroll to bottom during and after transition
                  const scrollToBottom = () => {
                    if (scrollRef.current) {
                      programmaticScroll.current = true;
                      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    }
                  };
                  scrollToBottom();
                  setTimeout(scrollToBottom, 50);
                  setTimeout(scrollToBottom, 150);
                  setTimeout(scrollToBottom, 300);
                  setTimeout(scrollToBottom, 350);
                }}
                className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors text-[10px] font-medium"
                title={logsExpanded ? "Collapse logs" : "Expand logs"}
              >
                {logsExpanded ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                {logsExpanded ? t("detail.collapse") : t("detail.expand")}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-cyan-400" />
              <span className="text-sm font-medium text-slate-300">{t("detail.logs")}</span>
              {service.state === "running" && subscribedRef.current && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1">
              {service.state === "running" && !locked && (
                <button
                  onClick={() => { setExecOpen((v) => { if (!v) setLogsExpanded(true); return !v; }); setExecResult(null); setExecError(null); }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${execOpen ? "text-purple-300 bg-purple-400/10" : "text-purple-400 hover:bg-purple-400/10"}`}
                  title="Exec command"
                >
                  <Terminal size={12} />
                  {t("detail.exec")}
                </button>
              )}
              <button
                onClick={() => {
                  setAutoScroll((v) => {
                    if (v) manualPause.current = true;
                    else manualPause.current = false;
                    return !v;
                  });
                }}
                className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
                title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
              >
                {autoScroll ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button
                onClick={() => startTransition(() => setLogsModal(true))}
                className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
                title="Open logs fullscreen"
              >
                <Maximize2 size={12} />
              </button>
            </div>
          </div>
          {/* Exec panel — below logs header */}
          {execOpen && (
            <div className="px-4 py-2.5 bg-slate-800/90 border-b border-slate-700/60 shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={execCmd}
                  onChange={(e) => setExecCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && execCmd.trim() && !execLoading) {
                      e.preventDefault();
                      runExec();
                    }
                  }}
                  placeholder={t("detail.execPlaceholder")}
                  className="flex-1 bg-slate-900 border border-slate-600 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
                <button
                  onClick={runExec}
                  disabled={!execCmd.trim() || execLoading}
                  className="px-3 py-1.5 rounded text-[11px] font-medium text-white bg-purple-700 hover:bg-purple-600 transition-colors disabled:opacity-40"
                >
                  {execLoading ? <Loader2 size={12} className="animate-spin" /> : t("detail.run")}
                </button>
                <button
                  onClick={() => { setExecOpen(false); setExecResult(null); setExecError(null); }}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
              {execError && (
                <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2.5 py-1.5">{execError}</div>
              )}
              {execResult && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={execResult.exitCode === 0 ? "text-emerald-400" : "text-red-400"}>
                      {t("detail.exitCodeLabel")}: {execResult.exitCode}
                    </span>
                  </div>
                  <pre className="bg-slate-900 rounded px-2.5 py-2 text-xs font-mono text-slate-300 max-h-48 overflow-auto whitespace-pre-wrap break-all">{execResult.output || t("detail.noOutput")}</pre>
                </div>
              )}
            </div>
          )}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-xs leading-5 px-3 py-2"
          >
            {loading && (
              <div className="text-slate-500 py-4 text-center">{t("detail.loadingLogs")}</div>
            )}
            {!loading && allLines.length === 0 && (
              <div className="text-slate-500 py-4 text-center">{t("detail.noLogs")}</div>
            )}
            {allLines.map((l, i) => (
              <div key={i} className="flex gap-0 hover:bg-slate-800/40">
                {l.timestamp && (
                  <span className="text-slate-600 shrink-0 select-none pr-2 whitespace-nowrap">
                    {formatTimestamp(l.timestamp)}
                  </span>
                )}
                <span className={`whitespace-pre truncate ${logLineColor(l)}`}>
                  {l.line}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Logs fullscreen modal */}
      {logsModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <Terminal size={16} className="text-cyan-400" />
              <span className="text-sm font-semibold text-white">{service.name}</span>
              <span className="text-xs text-slate-500 font-mono">logs</span>
              {service.state === "running" && subscribedRef.current && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const text = allLines.map((l) => `${l.timestamp ? formatTimestamp(l.timestamp) + " " : ""}${l.line}`).join("\n");
                  try {
                    navigator.clipboard.writeText(text);
                  } catch {
                    const ta = document.createElement("textarea");
                    ta.value = text;
                    ta.style.position = "fixed";
                    ta.style.opacity = "0";
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                  }
                  setCopiedEnvIdx(-99);
                  setTimeout(() => setCopiedEnvIdx(null), 1500);
                }}
                className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
                title="Copy all logs"
              >
                {copiedEnvIdx === -99 ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
              <button
                onClick={() => setLogsModal(false)}
                className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div
            ref={modalScrollRef}
            className="flex-1 overflow-y-auto overflow-x-auto font-mono text-xs leading-5 px-6 py-3"
          >
            {allLines.length > 500 && (
              <div className="text-slate-600 text-center py-2 text-[11px]">
                {allLines.length - 500} {t("detail.linesHidden")}
              </div>
            )}
            {(allLines.length > 500 ? allLines.slice(-500) : allLines).map((l, i) => (
              <div key={i} className="flex gap-0 hover:bg-slate-800/40">
                {l.timestamp && (
                  <span className="text-slate-600 shrink-0 select-none pr-3 whitespace-nowrap">
                    {formatTimestamp(l.timestamp)}
                  </span>
                )}
                <span className={`whitespace-pre-wrap break-all ${logLineColor(l)}`}>
                  {l.line}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ERROR_PATTERN = /\b(error|fatal|critical|exception|traceback|panic|failed|segfault)\b/i;
const WARN_PATTERN = /\b(warn|warning)\b/i;

function logLineColor(l: LogLine): string {
  if (l.line.startsWith("[DOCKER]")) return "text-cyan-400 font-semibold";
  if (ERROR_PATTERN.test(l.line)) return "text-red-400";
  if (WARN_PATTERN.test(l.line)) return "text-yellow-400";
  return "text-slate-400";
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-0.5">{label}</span>
      <span className={`text-sm text-slate-200 ${mono ? "font-mono" : ""} break-all`}>{value}</span>
    </div>
  );
}



function StatCard({ label, value, extra, color, limit, threshold, thresholdLabel, limitLabel, thresholdTooltip, limitTooltip, valueTooltip }: { label: string; value: string; extra?: string; color: string; limit?: string; threshold?: string; thresholdLabel?: string; limitLabel?: string; thresholdTooltip?: string; limitTooltip?: string; valueTooltip?: string }) {
  return (
    <div className="bg-slate-800/80 rounded-lg px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
        {valueTooltip && <Tooltip text={valueTooltip} size={11} width="w-72" placement="bottom" />}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-xl font-mono font-semibold ${color}`}>{value}</span>
          {extra && <span className="text-xs text-slate-500">{extra}</span>}
        </div>
        {(threshold || limit) && (
          <div className="flex flex-col items-end gap-0.5">
            {threshold && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">{thresholdLabel}:</span>
                <span className="text-[10px] text-slate-400 font-mono">{threshold}</span>
                {thresholdTooltip && <Tooltip text={thresholdTooltip} size={10} width="w-48" />}
              </div>
            )}
            {limit && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">{limitLabel}:</span>
                <span className="text-[10px] text-slate-400 font-mono">{limit}</span>
                {limitTooltip && <Tooltip text={limitTooltip} size={10} width="w-48" />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatMemTooltip(b: NonNullable<Stats["mem_breakdown"]>, t: (k: any) => string): string {
  const fmt = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
  return [
    `${t("detail.memBreakdown")}:`,
    "",
    `  ${t("detail.memAnon")}: ${fmt(b.anon_mb)}`,
    `  ${t("detail.memCache")}: ${fmt(b.cache_mb)}`,
    `  ${t("detail.memTotal")}: ${fmt(b.total_mb)}`,
    `  ${t("detail.memLimit")}: ${fmt(b.limit_mb)}`,
    "",
    t("detail.memTooltipHint"),
  ].join("\n");
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts.slice(11, 19);
  }
}
