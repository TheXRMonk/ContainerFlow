import { useEffect, useState, useCallback, useRef } from "react";
import type { EventLogEntry, NotificationLogEntry, WSMessage } from "../../shared/types";

export function useEventsLog(token: string, limit = 200) {
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`/api/events?limit=${limit}`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: EventLogEntry[]) => { setEvents(d); setLoading(false); })
      .catch(() => { setEvents([]); setLoading(false); });
  }, [token, limit]);

  const prepend = useCallback((entry: EventLogEntry) => {
    setEvents((prev) => [entry, ...prev].slice(0, 1000));
  }, []);

  return { events, loading, prepend };
}

export function useNotificationsLog(token: string, limit = 100) {
  const [notifications, setNotifications] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`/api/notifications?limit=${limit}`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: NotificationLogEntry[]) => { setNotifications(d); setLoading(false); })
      .catch(() => { setNotifications([]); setLoading(false); });
  }, [token, limit]);

  const prepend = useCallback((entry: NotificationLogEntry) => {
    setNotifications((prev) => [entry, ...prev].slice(0, 500));
  }, []);

  return { notifications, loading, prepend };
}

/** Hook into the existing WebSocket to receive event_log / notification_log push messages.
 *  Pass the ws ref from useDocker (or use a separate WS listener).
 *  Simplest: a tiny dedicated WebSocket that listens for these two message types. */
export function useEventsNotificationsLive(token: string, onEvent: (e: EventLogEntry) => void, onNotification: (n: NotificationLogEntry) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const eventCb = useRef(onEvent);
  const notifCb = useRef(onNotification);
  eventCb.current = onEvent;
  notifCb.current = onNotification;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => {
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        if (msg.type === "event_log") eventCb.current(msg.data);
        else if (msg.type === "notification_log") notifCb.current(msg.data);
      } catch {}
    };
    return () => {
      try { ws.close(); } catch {}
    };
  }, [token]);
}
