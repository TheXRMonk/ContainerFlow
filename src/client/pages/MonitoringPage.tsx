import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Activity, Play, Square, RotateCcw, AlertTriangle, BarChart3, ChevronDown, Check, Maximize2, Minimize2, Settings } from "lucide-react";
import type { DockerEvent, StatsRange, Service, ContainerSettings, DiscordConfig } from "../../shared/types";
import { useT } from "../i18n";
import { useAllStatsHistory } from "../hooks/useStatsHistory";
import { StatsCard } from "../components/StatsCard";
import { ThresholdBar } from "../components/ThresholdBar";
import { guessIcon } from "../nodes/ServiceNode";

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

function ServiceIcon({ uid, services }: { uid: string; services: Service[] }) {
  const svc = services.find((s) => s.uid === uid);
  if (!svc) return null;
  const { Icon, color } = guessIcon(svc.image, svc.name);
  return (
    <div
      className="flex items-center justify-center w-6 h-6 rounded shrink-0"
      style={{ backgroundColor: `${color}22` }}
    >
      <Icon size={14} style={{ color }} />
    </div>
  );
}

function FilterDropdown({ label, open, onToggle, children, dropdownRef }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 border border-slate-700/50 px-3 py-1.5 rounded-md transition-colors"
      >
        <span className="text-slate-300 truncate max-w-[140px]">{label}</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 py-1.5 min-w-[220px] max-h-[320px] overflow-y-auto z-20">
          {children}
        </div>
      )}
    </div>
  );
}

interface MonitoringPageProps {
  events: DockerEvent[];
  token: string;
  services: Service[];
}

export function MonitoringPage({ events, token, services }: MonitoringPageProps) {
  const { t } = useT();
  const [statsRange, setStatsRange] = useState<StatsRange>("1h");
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [configService, setConfigService] = useState<string | null>(null);
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<HTMLDivElement>(null);
  const { data: allHistory, loading: historyLoading } = useAllStatsHistory(statsRange, token);
  const [containerSettings, setContainerSettings] = useState<Record<string, ContainerSettings>>({});
  const [globalThresholds, setGlobalThresholds] = useState<{ cpu: number; mem: number }>({ cpu: 80, mem: 90 });
  const [discordEnabled, setDiscordEnabled] = useState(false);

  // Load thresholds
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/container-settings", { headers })
      .then((r) => r.ok ? r.json() : {})
      .then((data: Record<string, ContainerSettings>) => setContainerSettings(data))
      .catch(() => {});
    fetch("/api/discord-config", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data: DiscordConfig | null) => {
        if (data) {
          setGlobalThresholds({ cpu: data.thresholds.cpuPercent, mem: data.thresholds.memPercent });
          setDiscordEnabled(data.enabled && !!data.webhookUrl);
        }
      })
      .catch(() => {});
  }, [token]);

  // Save a single container's settings
  const saveContainerSetting = useCallback(async (uid: string, settings: ContainerSettings) => {
    setContainerSettings((prev) => ({ ...prev, [uid]: settings }));
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch("/api/container-settings", {
        method: "PUT",
        headers,
        body: JSON.stringify({ uid, settings }),
      });
    } catch {}
  }, [token]);

  // Auto-save container settings on drag (debounced)
  const csSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((uid: string, settings: ContainerSettings) => {
    if (csSaveTimer.current) clearTimeout(csSaveTimer.current);
    csSaveTimer.current = setTimeout(() => {
      saveContainerSetting(uid, settings);
    }, 400);
  }, [saveContainerSetting]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as HTMLElement)) {
        setProjectFilterOpen(false);
      }
      if (serviceRef.current && !serviceRef.current.contains(e.target as HTMLElement)) {
        setServiceFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build all known services from services prop + events + history
  const allServiceNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of services) names.add(s.uid);
    for (const ev of events) names.add(ev.service);
    for (const svc of Object.keys(allHistory)) names.add(svc);
    return [...names].sort();
  }, [services, events, allHistory]);

  // Extract unique projects
  const allProjects = useMemo(() => {
    const projects = new Set<string>();
    for (const svc of allServiceNames) {
      const slash = svc.indexOf("/");
      projects.add(slash >= 0 ? svc.slice(0, slash) : "standalone");
    }
    return [...projects].sort();
  }, [allServiceNames]);

  // Services filtered by selected projects
  const projectFilteredServices = useMemo(() => {
    if (selectedProjects.size === 0) return allServiceNames;
    return allServiceNames.filter((svc) => {
      const slash = svc.indexOf("/");
      const project = slash >= 0 ? svc.slice(0, slash) : "standalone";
      return selectedProjects.has(project);
    });
  }, [allServiceNames, selectedProjects]);

  // Final filtered set (project filter + service filter)
  // When no service is explicitly selected, show nothing (require selection)
  const hasActiveFilter = selectedServices.size > 0 || selectedProjects.size > 0;
  const finalFilteredServices = useMemo(() => {
    if (selectedServices.size > 0) return new Set(projectFilteredServices.filter((svc) => selectedServices.has(svc)));
    if (selectedProjects.size > 0) return new Set(projectFilteredServices);
    return new Set<string>();
  }, [projectFilteredServices, selectedServices, selectedProjects]);

  // Filtered data
  const filteredHistory = useMemo(() => {
    const result: Record<string, typeof allHistory[string]> = {};
    for (const [svc, points] of Object.entries(allHistory)) {
      if (finalFilteredServices.has(svc)) result[svc] = points;
    }
    return result;
  }, [allHistory, finalFilteredServices]);

  const filteredEvents = useMemo(() => {
    const sorted = [...events].reverse();
    if (!hasActiveFilter) return sorted;
    return sorted.filter((ev) => finalFilteredServices.has(ev.service));
  }, [events, finalFilteredServices, hasActiveFilter]);

  const historyServiceNames = Object.keys(filteredHistory).sort();

  // Toggle helpers
  const toggleProject = (project: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  };

  const toggleService = (svc: string) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(svc)) next.delete(svc);
      else next.add(svc);
      return next;
    });
  };

  // Labels
  const projectLabel = selectedProjects.size === 0
    ? t("monitoring.filterProject")
    : selectedProjects.size === allProjects.length
      ? t("monitoring.allProjects")
      : selectedProjects.size === 1
        ? [...selectedProjects][0]
        : `${selectedProjects.size} ${t("filter.projects").toLowerCase()}`;

  const serviceLabel = selectedServices.size === 0
    ? t("monitoring.filterService")
    : selectedServices.size === projectFilteredServices.length
      ? t("monitoring.allServices")
      : selectedServices.size === 1
        ? ([...selectedServices][0].split("/").pop() || [...selectedServices][0])
        : `${selectedServices.size} ${t("footer.containers")}`;

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity size={24} className="text-cyan-400" />
            <div>
              <h1 className="text-xl font-bold text-white">{t("monitoring.title")}</h1>
              <p className="text-sm text-slate-500">{t("monitoring.subtitle")}</p>
            </div>
          </div>

          {/* Filters */}
          {allServiceNames.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Project filter */}
              {allProjects.length > 1 && (
                <FilterDropdown
                  label={projectLabel}
                  open={projectFilterOpen}
                  onToggle={() => { setProjectFilterOpen((v) => !v); setServiceFilterOpen(false); }}
                  dropdownRef={projectRef}
                >
                  <button
                    onClick={() => { setSelectedProjects(new Set(allProjects)); }}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      selectedProjects.size === allProjects.length ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                    }`}>
                      {selectedProjects.size === allProjects.length && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-slate-300 font-medium">{t("monitoring.allProjects")}</span>
                  </button>
                  <div className="border-t border-slate-700/50 my-1" />
                  {allProjects.map((project) => {
                    const isSelected = selectedProjects.has(project);
                    return (
                      <button
                        key={project}
                        onClick={() => toggleProject(project)}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                        }`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <span className={isSelected ? "text-slate-200" : "text-slate-400"}>{project}</span>
                      </button>
                    );
                  })}
                </FilterDropdown>
              )}

              {/* Service filter */}
              <FilterDropdown
                label={serviceLabel}
                open={serviceFilterOpen}
                onToggle={() => { setServiceFilterOpen((v) => !v); setProjectFilterOpen(false); }}
                dropdownRef={serviceRef}
              >
                <button
                  onClick={() => { setSelectedServices(new Set(projectFilteredServices)); }}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                    selectedServices.size === projectFilteredServices.length ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                  }`}>
                    {selectedServices.size === projectFilteredServices.length && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-slate-300 font-medium">{t("monitoring.allServices")}</span>
                </button>
                <div className="border-t border-slate-700/50 my-1" />
                {projectFilteredServices.map((svc) => {
                  const shortName = svc.split("/").pop() || svc;
                  const isSelected = selectedServices.has(svc);
                  return (
                    <button
                      key={svc}
                      onClick={() => toggleService(svc)}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-slate-700/60 transition-colors"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected ? "bg-cyan-500 border-cyan-500" : "border-slate-600"
                      }`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <ServiceIcon uid={svc} services={services} />
                      <span className={isSelected ? "text-slate-200" : "text-slate-400"}>{shortName}</span>
                    </button>
                  );
                })}
              </FilterDropdown>
            </div>
          )}
        </div>

        {/* Resource Usage History */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/40">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-cyan-400" />
              <span className="text-sm font-medium text-slate-200">{t("monitoring.statsHistory")}</span>
            </div>
            <div className="flex gap-0.5">
              {(["1h", "6h", "24h", "7d"] as StatsRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setStatsRange(r)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    statsRange === r
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {!hasActiveFilter ? (
            <div className="px-6 py-10 text-center">
              <BarChart3 size={28} className="mx-auto mb-3 text-slate-600 opacity-50" />
              <p className="text-sm text-slate-500 mb-3">{t("monitoring.selectFilter")}</p>
              <button
                onClick={() => { setSelectedProjects(new Set(allProjects)); }}
                className="px-4 py-1.5 text-xs font-medium bg-cyan-500/15 text-cyan-400 rounded-lg hover:bg-cyan-500/25 transition-colors"
              >
                {t("monitoring.loadAll")}
              </button>
            </div>
          ) : historyLoading ? (
            <div className="px-6 py-8 text-center text-slate-500 text-sm">
              {t("monitoring.loadingHistory")}
            </div>
          ) : historyServiceNames.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-500 text-sm">
              {t("monitoring.noHistoryData")}
            </div>
          ) : (
            <div className="divide-y divide-slate-700/40">
              {historyServiceNames.map((svc) => {
                const points = filteredHistory[svc] || [];
                const shortName = svc.split("/").pop() || svc;
                const cs = containerSettings[svc];
                const svcNotifs = discordEnabled && (cs?.notificationsEnabled !== false);
                const cpuThreshold = svcNotifs ? (cs?.cpuThreshold ?? globalThresholds.cpu) : undefined;
                const memThreshold = svcNotifs ? (cs?.memThreshold ?? globalThresholds.mem) : undefined;
                const latest = points.length > 0 ? points[points.length - 1] : null;
                const isExpanded = expandedService === svc;
                const chartHeight = isExpanded ? 120 : 56;
                const svcData = services.find((s) => s.uid === svc);
                const cpuLimit = svcData && svcData.cpu_quota > 0 ? `${(svcData.cpu_quota / 1000).toFixed(0)}%` : undefined;
                const memLimit = svcData && svcData.memory_limit > 0 ? `${(svcData.memory_limit / 1024 / 1024).toFixed(0)} MB` : undefined;
                return (
                  <div key={svc} className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ServiceIcon uid={svc} services={services} />
                      <div className="min-w-0">
                        <span className="text-xs text-slate-300 font-medium truncate block">{shortName}</span>
                        {svc.includes("/") && (
                          <span className="text-[10px] text-slate-500 truncate block leading-tight">{svc.split("/")[0]}</span>
                        )}
                      </div>
                      <div className="flex-1" />
                      {discordEnabled && (
                        <button
                          onClick={() => {
                            const opening = configService !== svc;
                            setConfigService(opening ? svc : null);
                            if (opening) setExpandedService(svc);
                            else setExpandedService(null);
                          }}
                          className={`p-1 rounded hover:bg-slate-700/60 transition-colors ${configService === svc ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}
                          title={t("detail.config")}
                        >
                          <Settings size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedService(isExpanded ? null : svc)}
                        className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-slate-300 transition-colors"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                      </button>
                    </div>
                    {/* Inline config panel */}
                    {configService === svc && (() => {
                      const settings = cs || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null };
                      const cpuTh = settings.cpuThreshold ?? globalThresholds.cpu;
                      const memTh = settings.memThreshold ?? globalThresholds.mem;
                      const cpuVal = latest?.cpu ?? 0;
                      const memVal = latest?.mem_percent ?? 0;
                      const memMb = latest?.mem_mb ?? 0;
                      return (
                        <div className="mb-2 bg-slate-900/90 border border-slate-700/40 rounded-lg px-4 py-3 space-y-3">
                          {/* Notifications toggle */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-300">{t("detail.notifications")}</span>
                            <button
                              type="button"
                              onClick={() => saveContainerSetting(svc, { ...settings, notificationsEnabled: !settings.notificationsEnabled })}
                              className={`relative w-9 h-5 rounded-full transition-colors ${settings.notificationsEnabled ? "bg-cyan-600" : "bg-slate-600"}`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.notificationsEnabled ? "translate-x-4" : "translate-x-0"}`} />
                            </button>
                          </div>
                          {settings.notificationsEnabled && (
                            <>
                              <ThresholdBar
                                label={t("detail.cpuUsage")}
                                value={cpuVal}
                                threshold={cpuTh}
                                isCustom={settings.cpuThreshold !== null}
                                showThreshold={true}
                                thresholdLabel={t("detail.cpuThreshold")}
                                tagLabel={settings.cpuThreshold !== null ? t("detail.custom") : t("detail.global")}
                                hintLabel={t("detail.thresholdHint")}
                                onThresholdChange={(v) => {
                                  setContainerSettings((prev) => {
                                    const cur = prev[svc] || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null };
                                    const updated = { ...cur, cpuThreshold: v };
                                    debouncedSave(svc, updated);
                                    return { ...prev, [svc]: updated };
                                  });
                                }}
                                onReset={() => saveContainerSetting(svc, { ...(cs || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null }), cpuThreshold: null })}
                                formatValue={(v) => `${v.toFixed(1)}%`}
                                baseColor="cyan"
                              />
                              <ThresholdBar
                                label={t("detail.memoryUsage")}
                                value={memVal}
                                threshold={memTh}
                                isCustom={settings.memThreshold !== null}
                                showThreshold={true}
                                thresholdLabel={t("detail.memThreshold")}
                                tagLabel={settings.memThreshold !== null ? t("detail.custom") : t("detail.global")}
                                hintLabel={t("detail.thresholdHint")}
                                onThresholdChange={(v) => {
                                  setContainerSettings((prev) => {
                                    const cur = prev[svc] || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null };
                                    const updated = { ...cur, memThreshold: v };
                                    debouncedSave(svc, updated);
                                    return { ...prev, [svc]: updated };
                                  });
                                }}
                                onReset={() => saveContainerSetting(svc, { ...(cs || { notificationsEnabled: true, cpuThreshold: null, memThreshold: null }), memThreshold: null })}
                                formatValue={() => `${memMb.toFixed(0)} MB (${memVal.toFixed(1)}%)`}
                                formatThreshold={svcData && svcData.memory_limit > 0 ? (th) => `${((th / 100) * svcData.memory_limit / 1024 / 1024).toFixed(0)} MB` : undefined}
                                baseColor="purple"
                              />
                            </>
                          )}
                        </div>
                      );
                    })()}
                    <div className={isExpanded ? "space-y-2" : "grid grid-cols-2 gap-2"}>
                      <StatsCard
                        label="CPU"
                        value={latest ? `${latest.cpu.toFixed(1)}%` : "—"}
                        limit={cpuLimit}
                        data={points.map((p) => p.cpu)}
                        timestamps={points.map((p) => p.timestamp)}
                        hoverValues={points.map((p) => p.cpu)}
                        color="#06b6d4"
                        threshold={cpuThreshold}
                        sparklineHeight={chartHeight}
                        formatHoverValue={(v) => `${v.toFixed(2)}%`}
                        showAverage
                        formatAverage={(v) => `${v.toFixed(2)}%`}
                        avgLabel={t("detail.avg")}
                      />
                      <StatsCard
                        label="MEM"
                        value={latest ? `${latest.mem_mb.toFixed(0)} MB` : "—"}
                        limit={memLimit}
                        data={points.map((p) => p.mem_percent)}
                        timestamps={points.map((p) => p.timestamp)}
                        hoverValues={points.map((p) => p.mem_mb)}
                        color="#a78bfa"
                        threshold={memThreshold}
                        sparklineHeight={chartHeight}
                        formatHoverValue={(v) => `${v.toFixed(0)} MB`}
                        showAverage
                        formatAverage={(v) => `${v.toFixed(0)} MB`}
                        avgLabel={t("detail.avg")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Events list */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl overflow-hidden">
          {filteredEvents.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              <Activity size={32} className="mx-auto mb-3 opacity-40" />
              <p>{t("monitoring.noEvents")}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/40">
              {filteredEvents.map((ev, i) => (
                <div key={`${ev.service}-${ev.time}-${i}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-700/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center flex-shrink-0">
                    {eventIcon(ev.action)}
                  </div>
                  <ServiceIcon uid={ev.service} services={services} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm text-slate-200 font-medium truncate">
                        {ev.service.split("/").pop() || ev.service}
                      </span>
                      {ev.service.includes("/") && (
                        <span className="text-[10px] text-slate-500 truncate">
                          {ev.service.split("/")[0]}
                        </span>
                      )}
                    </div>
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
          <p className="text-sm text-slate-500 font-medium">{t("monitoring.alertRules")}</p>
          <p className="text-xs text-slate-600 mt-1">{t("monitoring.alertRulesDesc")}</p>
        </div>
      </div>
    </div>
  );
}
