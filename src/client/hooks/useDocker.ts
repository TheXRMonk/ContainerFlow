import { useState, useEffect, useRef, useCallback } from "react";
import type { Service, Connection, Stats, DockerEvent, LogLine, Flow, FlowSettings, WSMessage } from "../../shared/types";

function arraysEqual<T extends { uid?: string; name?: string }>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] as any).uid !== (b[i] as any).uid) return false;
    if ((a[i] as any).state !== (b[i] as any).state) return false;
  }
  return true;
}

export function useDocker(token = "") {
  const [services, setServices] = useState<Service[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const statsRef = useRef<Map<string, Stats>>(new Map());
  const [statsVersion, setStatsVersion] = useState(0);
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowSettings, setFlowSettings] = useState<FlowSettings>({
    particle_size: 5, trail: true, trail_opacity: 0.3, glow: true, max_particles: 50,
  });
  const particleSpawnCallbacks = useRef<Set<(data: { flowId: string; color: string; speed: number; path: string[] }) => void>>(new Set());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Initial HTTP fetch so data loads even if WS is slow
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    Promise.all([
      fetch("/api/services", { headers }).then((r) => r.ok ? r.json() : []),
      fetch("/api/connections", { headers }).then((r) => r.ok ? r.json() : []),
      fetch("/api/flows", { headers }).then((r) => r.ok ? r.json() : null),
    ]).then(([svcs, conns, flowData]) => {
      setServices((prev) => prev.length === 0 ? svcs : prev);
      setConnections((prev) => prev.length === 0 ? conns : prev);
      if (flowData?.flows) {
        setFlows((prev) => prev.length === 0 ? flowData.flows : prev);
        setFlowSettings(flowData.settings);
      }
    }).catch(() => {});
  }, [token]);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = token ? `?token=${encodeURIComponent(token)}` : "";
    const wsUrl = `${protocol}//${window.location.host}/ws${params}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);

        switch (msg.type) {
          case "services":
            setServices((prev) => arraysEqual(prev, msg.data) ? prev : msg.data);
            break;
          case "connections":
            setConnections((prev) => {
              if (prev.length === msg.data.length) return prev;
              return msg.data;
            });
            break;
          case "stats": {
            let changed = false;
            for (const s of msg.data) {
              const existing = statsRef.current.get(s.service);
              if (!existing || existing.cpu !== s.cpu || existing.mem_mb !== s.mem_mb) {
                statsRef.current.set(s.service, s);
                changed = true;
              }
            }
            if (changed) setStatsVersion((v) => v + 1);
            break;
          }
          case "docker_event":
            setEvents((prev) => {
              if (prev.length >= 10) return [...prev.slice(-9), msg.data];
              return [...prev, msg.data];
            });
            break;
          case "log_line":
            setLogLines((prev) => {
              const next = [...prev, msg.data];
              return next.length > 2000 ? next.slice(-1500) : next;
            });
            break;
          case "flows":
            setFlows(msg.data.flows);
            setFlowSettings(msg.data.settings);
            break;
          case "particle_spawn":
            for (const cb of particleSpawnCallbacks.current) cb(msg.data);
            break;
        }
      } catch {}
    };
  }, [token]);

  useEffect(() => {
    connect();

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(reconnectTimer.current);
        if (wsRef.current) {
          wsRef.current.onclose = null;
          wsRef.current.close();
        }
        setConnected(false);
      } else if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((msg: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearLogLines = useCallback(() => setLogLines([]), []);

  const onParticleSpawn = useCallback((cb: (data: { flowId: string; color: string; speed: number; path: string[] }) => void) => {
    particleSpawnCallbacks.current.add(cb);
    return () => { particleSpawnCallbacks.current.delete(cb); };
  }, []);

  return { services, connections, stats: statsRef.current, statsVersion, events, connected, logLines, sendMessage, clearLogLines, flows, flowSettings, onParticleSpawn };
}
