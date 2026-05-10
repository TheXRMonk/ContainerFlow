import { Database } from "bun:sqlite";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, ".dockerflow-events.db");

const MAX_EVENTS = 1000;
const MAX_NOTIFICATIONS = 500;

let db: Database;

export interface EventLogEntry {
  id: number;
  timestamp: number;
  service: string;
  action: string;
  source: "docker" | "ui";
  error_msg: string | null;
}

export interface NotificationLogEntry {
  id: number;
  timestamp: number;
  type: "state_change" | "resource_alert" | "ui_action" | "action_error";
  service: string;
  level: "info" | "warning" | "error";
  title: string;
  message: string;
}

export function initEventsDB() {
  db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS events_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      service TEXT NOT NULL,
      action TEXT NOT NULL,
      source TEXT NOT NULL,
      error_msg TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_time ON events_log (timestamp DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_service ON events_log (service, timestamp DESC)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      service TEXT NOT NULL,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_notif_time ON notifications_log (timestamp DESC)");

  // Initial prune + schedule periodic
  pruneOld();
  setInterval(pruneOld, 60 * 60_000); // hourly
}

export function insertEvent(service: string, action: string, source: "docker" | "ui", errorMsg?: string): EventLogEntry | null {
  if (!db) return null;
  const ts = Math.floor(Date.now() / 1000);
  const result = db.prepare(
    "INSERT INTO events_log (timestamp, service, action, source, error_msg) VALUES (?, ?, ?, ?, ?)"
  ).run(ts, service, action, source, errorMsg || null);
  return {
    id: Number(result.lastInsertRowid),
    timestamp: ts,
    service,
    action,
    source,
    error_msg: errorMsg || null,
  };
}

export function insertNotification(
  type: NotificationLogEntry["type"],
  service: string,
  level: NotificationLogEntry["level"],
  title: string,
  message: string,
): NotificationLogEntry | null {
  if (!db) return null;
  const ts = Math.floor(Date.now() / 1000);
  const result = db.prepare(
    "INSERT INTO notifications_log (timestamp, type, service, level, title, message) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(ts, type, service, level, title, message);
  return {
    id: Number(result.lastInsertRowid),
    timestamp: ts,
    type,
    service,
    level,
    title,
    message,
  };
}

export function getEvents(opts: { limit?: number; since?: number; service?: string; action?: string } = {}): EventLogEntry[] {
  if (!db) return [];
  const limit = Math.min(opts.limit ?? 200, 1000);
  const where: string[] = [];
  const args: any[] = [];
  if (opts.since !== undefined) { where.push("timestamp >= ?"); args.push(opts.since); }
  if (opts.service) { where.push("service = ?"); args.push(opts.service); }
  if (opts.action) { where.push("action = ?"); args.push(opts.action); }
  const whereSQL = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT * FROM events_log ${whereSQL} ORDER BY timestamp DESC, id DESC LIMIT ?`
  ).all(...args, limit) as EventLogEntry[];
  return rows;
}

export function getNotifications(opts: { limit?: number; since?: number; type?: string; level?: string } = {}): NotificationLogEntry[] {
  if (!db) return [];
  const limit = Math.min(opts.limit ?? 100, 500);
  const where: string[] = [];
  const args: any[] = [];
  if (opts.since !== undefined) { where.push("timestamp >= ?"); args.push(opts.since); }
  if (opts.type) { where.push("type = ?"); args.push(opts.type); }
  if (opts.level) { where.push("level = ?"); args.push(opts.level); }
  const whereSQL = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT * FROM notifications_log ${whereSQL} ORDER BY timestamp DESC, id DESC LIMIT ?`
  ).all(...args, limit) as NotificationLogEntry[];
  return rows;
}

/** Trim oldest entries beyond the retention cap. Called hourly + on startup. */
export function pruneOld() {
  if (!db) return;
  try {
    db.prepare(
      `DELETE FROM events_log WHERE id IN (
        SELECT id FROM events_log ORDER BY timestamp DESC, id DESC LIMIT -1 OFFSET ?
      )`
    ).run(MAX_EVENTS);
    db.prepare(
      `DELETE FROM notifications_log WHERE id IN (
        SELECT id FROM notifications_log ORDER BY timestamp DESC, id DESC LIMIT -1 OFFSET ?
      )`
    ).run(MAX_NOTIFICATIONS);
  } catch {}
}
