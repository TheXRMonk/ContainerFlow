import { Database } from "bun:sqlite";
import path from "path";
import type { Stats, StatsHistoryPoint, StatsRange } from "../shared/types";

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH = path.join(DATA_DIR, ".dockerflow-stats.db");

let db: Database;

const RANGE_BUCKET: Record<StatsRange, number> = {
  "1h": 30,
  "6h": 60,
  "24h": 300,
  "7d": 1800,
};

const RANGE_SECONDS: Record<StatsRange, number> = {
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};

export function initStatsDB() {
  db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      cpu REAL NOT NULL,
      mem_mb REAL NOT NULL,
      mem_percent REAL NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_service_time ON stats_raw (service, timestamp)
  `);

  // Initial cleanup
  cleanupOldStats();

  // Schedule cleanup every hour
  setInterval(cleanupOldStats, 3600_000);
}

export function insertStats(stats: Stats[]) {
  if (!db || stats.length === 0) return;
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    "INSERT INTO stats_raw (service, timestamp, cpu, mem_mb, mem_percent) VALUES (?, ?, ?, ?, ?)"
  );
  const transaction = db.transaction(() => {
    for (const s of stats) {
      stmt.run(s.service, now, s.cpu, s.mem_mb, s.mem_percent);
    }
  });
  transaction();
}

export function getStatsHistory(service: string, range: StatsRange): StatsHistoryPoint[] {
  if (!db) return [];
  const bucket = RANGE_BUCKET[range];
  const since = Math.floor(Date.now() / 1000) - RANGE_SECONDS[range];

  const rows = db.prepare(`
    SELECT
      (timestamp / ?) * ? AS ts,
      AVG(cpu) AS cpu,
      AVG(mem_mb) AS mem_mb,
      AVG(mem_percent) AS mem_percent
    FROM stats_raw
    WHERE service = ? AND timestamp >= ?
    GROUP BY ts
    ORDER BY ts ASC
  `).all(bucket, bucket, service, since) as { ts: number; cpu: number; mem_mb: number; mem_percent: number }[];

  return rows.map((r) => ({
    timestamp: r.ts,
    cpu: r.cpu,
    mem_mb: r.mem_mb,
    mem_percent: r.mem_percent,
  }));
}

export function getAllServicesStatsHistory(range: StatsRange): Record<string, StatsHistoryPoint[]> {
  if (!db) return {};
  const bucket = RANGE_BUCKET[range];
  const since = Math.floor(Date.now() / 1000) - RANGE_SECONDS[range];

  const rows = db.prepare(`
    SELECT
      service,
      (timestamp / ?) * ? AS ts,
      AVG(cpu) AS cpu,
      AVG(mem_mb) AS mem_mb,
      AVG(mem_percent) AS mem_percent
    FROM stats_raw
    WHERE timestamp >= ?
    GROUP BY service, ts
    ORDER BY service, ts ASC
  `).all(bucket, bucket, since) as { service: string; ts: number; cpu: number; mem_mb: number; mem_percent: number }[];

  const result: Record<string, StatsHistoryPoint[]> = {};
  for (const r of rows) {
    if (!result[r.service]) result[r.service] = [];
    result[r.service].push({
      timestamp: r.ts,
      cpu: r.cpu,
      mem_mb: r.mem_mb,
      mem_percent: r.mem_percent,
    });
  }
  return result;
}

export function cleanupOldStats() {
  if (!db) return;
  const cutoff = Math.floor(Date.now() / 1000) - RANGE_SECONDS["7d"];
  db.prepare("DELETE FROM stats_raw WHERE timestamp < ?").run(cutoff);
  try {
    db.exec("VACUUM");
  } catch {}
}
