import { useState, useEffect, useRef, useCallback } from "react";
import type { Service, Connection, Stats, DockerEvent, LogLine, WSMessage } from "../../shared/types";
import type { StatsStore } from "./useStatsStore";

function arraysEqual(a: Service[], b: Service[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].uid !== b[i].uid) return false;
    if (a[i].state !== b[i].state) return false;
  }
  return true;
}

export function useDocker(token = "", statsStore?: StatsStore, onPositions?: (pos: Record<string, { x: number; y: number }>) => void) {
  const [services, setServices] = useState<Service[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const statsRef = useRef<Map<string, Stats>>(new Map());
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  // Processing state: uid → { expected state, start time, min duration before clearing }
  const processingRef = useRef<Map<string, { expected: Service["state"]; startedAt: number; minDuration: number }>>(new Map());
  const lastRawServicesRef = useRef<Service[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Apply processing overlay to raw services data
  const applyProcessing = useCallback((raw: Service[]): Service[] => {
    const processing = processingRef.current;
    if (processing.size === 0) return raw;
    const now = Date.now();
    return raw.map((s: Service) => {
      const entry = processing.get(s.uid);
      if (!entry) return s;
      const elapsed = now - entry.startedAt;
      if (elapsed < entry.minDuration) {
        return { ...s, state: "processing" as any, _processingStartedAt: entry.startedAt } as any;
      }
      if (s.state === entry.expected) {
        processing.delete(s.uid);
        return s;
      }
      if (s.state === "crashed" && entry.expected === "running") {
        processing.delete(s.uid);
        return s;
      }
      if (now - entry.startedAt > 15000) {
        processing.delete(s.uid);
        return s;
      }
      return { ...s, state: "processing" as any, _processingStartedAt: entry.startedAt } as any;
    });
  }, []);

  // Single init call: services + connections + positions
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch("/api/init", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setServices((prev) => prev.length === 0 ? data.services : prev);
        setConnections((prev) => prev.length === 0 ? data.connections : prev);
        if (onPositions) onPositions(data.positions || {});
      })
      .catch(() => {});
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
            lastRawServicesRef.current = msg.data as Service[];
            const incoming = applyProcessing(msg.data as Service[]);
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
            for (const s of msg.data) {
              statsRef.current.set(s.service, s);
            }
            if (statsStore) {
              statsStore.update(statsRef.current);
            }
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
          case "action_error": {
            processingRef.current.delete(msg.data.uid);
            setServices((prev) => [...prev]);
            break;
          }
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
    // Re-evaluate every 1s after minDuration until processing clears.
    // Handles the case where the server stops broadcasting (hash unchanged).
    if (minDuration > 0) {
      const interval = setInterval(() => {
        if (!processingRef.current.has(uid)) { clearInterval(interval); return; }
        const elapsed = Date.now() - startedAt;
        if (elapsed < minDuration) return;
        const incoming = applyProcessing(lastRawServicesRef.current);
        setServices((prev) => arraysEqual(prev, incoming) ? prev : incoming);
        // applyProcessing deletes the entry when resolved or timed out (15s)
        if (!processingRef.current.has(uid)) clearInterval(interval);
      }, 1000);
    }
  }, [applyProcessing]);

  const clearProcessing = useCallback((uid: string) => {
    processingRef.current.delete(uid);
    setServices((prev) => [...prev]);
  }, []);

  const getLogsSince = useCallback((uid: string): number | undefined => {
    return actionTimestamps.current.get(uid);
  }, []);

  return { services, connections, stats: statsRef.current, events, connected, logLines, sendMessage, clearLogLines, setProcessing, clearProcessing, getLogsSince };
}
