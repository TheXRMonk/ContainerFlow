import { useState, useEffect } from "react";
import type { StatsHistoryPoint, StatsRange } from "../../shared/types";

export function useStatsHistory(uid: string, range: StatsRange, token: string, enabled = true) {
  const [data, setData] = useState<StatsHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`/api/stats/history/${uid}?range=${range}`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((d: StatsHistoryPoint[]) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData([]);
        setLoading(false);
      });
  }, [uid, range, token, enabled]);

  return { data, loading };
}

export function useAllStatsHistory(range: StatsRange, token: string) {
  const [data, setData] = useState<Record<string, StatsHistoryPoint[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`/api/stats/history?range=${range}`, { headers })
      .then((r) => r.ok ? r.json() : {})
      .then((d: Record<string, StatsHistoryPoint[]>) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData({});
        setLoading(false);
      });
  }, [range, token]);

  return { data, loading };
}
