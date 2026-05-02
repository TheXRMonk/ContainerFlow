import { useState, useEffect, useRef, useCallback } from "react";
import type { Service, Connection, Stats, DockerEvent, LogLine, WSMessage } from "../../shared/types";

function arraysEqual(a: Service[], b: Service[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].uid !== b[i].uid) return false;
    if (a[i].state !== b[i].state) return false;
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
  // Processing state: uid → { expected state, start time, min duration before clearing }
  const processingRef = useRef<Map<string, { expected: Service["state"]; startedAt: number; minDuration: number }>>(new Map());
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
    ]).then(([svcs, conns]) => {
      setServices((prev) => prev.length === 0 ? svcs : prev);
      setConnections((prev) => prev.length === 0 ? conns : prev);
    }).catch(() => {});
  }, [token]);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (token) {
        ws.send(JSON.stringify({ type: "auth", token }));
      } else {
        setConnected(true);
      }
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3_000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === "auth_ok") {
          setConnected(true);
          return;
        }
        if (msg.type === "auth_error") {
          ws.close();
          return;
        }

        switch (msg.type as WSMessage["type"]) {
          case "services": {
            const processing = processingRef.current;
            let incoming = msg.data as Service[];
            if (processing.size > 0) {
              const now = Date.now();
              incoming = incoming.map((s: Service) => {
                const entry = processing.get(s.uid);
                if (!entry) return s;
                // Don't clear processing until minDuration has passed (restart/rebuild need time for stop→start cycle)
                const elapsed = now - entry.startedAt;
                if (elapsed < entry.minDuration) {
                  return { ...s, state: "processing" as any, _processingStartedAt: entry.startedAt } as any;
                }
                // Server confirms expected state → clear processing
                if (s.state === entry.expected) {
                  processing.delete(s.uid);
                  return s;
                }
                // Container crashed while we expected "running" → clear processing, show crashed
                if (s.state === "crashed" && entry.expected === "running") {
                  processing.delete(s.uid);
                  return s;
                }
                // Timeout after 15s → give up, show real state
                if (now - entry.startedAt > 15000) {
                  processing.delete(s.uid);
                  return s;
                }
                // State doesn't match expected → keep in processing, ignore stale data
                return { ...s, state: "processing" as any, _processingStartedAt: entry.startedAt } as any;
              });
            }
            setServices((prev) => arraysEqual(prev, incoming) ? prev : incoming);
            break;
          }
          case "connections":
            setConnections((prev) => {
              if (prev.length === msg.data.length &&
                  prev.every((c: any, i: number) => c.from === msg.data[i].from && c.to === msg.data[i].to)) return prev;
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
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
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

  const actionTimestamps = useRef<Map<string, number>>(new Map());

  const setProcessing = useCallback((uid: string, expectedState: Service["state"], minDuration = 0) => {
    const startedAt = Date.now();
    processingRef.current.set(uid, { expected: expectedState, startedAt, minDuration });
    actionTimestamps.current.set(uid, Math.floor(startedAt / 1000));
    setServices((prev) => prev.map((s) => s.uid === uid ? { ...s, state: "processing" as any, _processingStartedAt: startedAt } as any : s));
  }, []);

  const getLogsSince = useCallback((uid: string): number | undefined => {
    return actionTimestamps.current.get(uid);
  }, []);

  return { services, connections, stats: statsRef.current, statsVersion, events, connected, logLines, sendMessage, clearLogLines, setProcessing, getLogsSince };
}
