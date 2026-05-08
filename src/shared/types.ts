export interface Service {
  id: string;
  uid: string;
  name: string;
  image: string;
  state: "running" | "exited" | "paused" | "restarting" | "dead" | "crashed";
  status: string;
  ports: { host: number; container: number }[];
  networks: string[];
  network_ips: Record<string, string>;
  project: string;
  compose_file: string;
  env: string[];
  restart_policy: string;
  memory_limit: number;
  cpu_quota: number;
  health_status: string;
  health_log: string[];
  exit_code: number;
  restart_count: number;
  oom_killed: boolean;
}

export interface Connection {
  from: string;
  to: string;
  network: string;
  type?: string;
  label?: string;
}

export interface Stats {
  service: string;
  cpu: number;
  mem_mb: number;
  mem_percent: number;
}

export interface DockerEvent {
  type: "docker";
  action: string;
  service: string;
  time: number;
}

export interface LogLine {
  container: string;
  line: string;
  timestamp: string;
  stream: "stdout" | "stderr";
}

export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  events: {
    containerStateChanges: boolean;
    resourceAlerts: boolean;
    uiActions: boolean;
    actionErrors: boolean;
  };
  thresholds: {
    cpuPercent: number;
    memPercent: number;
  };
  cooldownMinutes: number;
  downReminderMinutes: number;
}

export interface ContainerSettings {
  /** false = no enviar notificaciones para este contenedor */
  notificationsEnabled: boolean;
  /** Override del umbral global de CPU (null = usar global) */
  cpuThreshold: number | null;
  /** Override del umbral global de memoria (null = usar global) */
  memThreshold: number | null;
}

export interface StatsHistoryPoint {
  timestamp: number;
  cpu: number;
  mem_mb: number;
  mem_percent: number;
}

export type StatsRange = "1h" | "6h" | "24h" | "7d";

export type WSMessage =
  | { type: "services"; data: Service[] }
  | { type: "connections"; data: Connection[] }
  | { type: "stats"; data: Stats[] }
  | { type: "docker_event"; data: DockerEvent }
  | { type: "subscribe_logs"; container: string }
  | { type: "unsubscribe_logs" }
  | { type: "log_line"; data: LogLine }
  | { type: "action_error"; data: { uid: string; action: string; error: string } };
