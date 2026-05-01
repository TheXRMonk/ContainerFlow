export interface Service {
  id: string;
  uid: string;
  name: string;
  image: string;
  state: "running" | "exited" | "paused" | "restarting" | "dead";
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

export interface Flow {
  id: string;
  name: string;
  description?: string;
  color: string;
  speed: number;
  path: string[];
}

export interface FlowSettings {
  particle_size: number;
  trail: boolean;
  trail_opacity: number;
  glow: boolean;
  max_particles: number;
}

export type WSMessage =
  | { type: "services"; data: Service[] }
  | { type: "connections"; data: Connection[] }
  | { type: "stats"; data: Stats[] }
  | { type: "docker_event"; data: DockerEvent }
  | { type: "subscribe_logs"; container: string }
  | { type: "unsubscribe_logs" }
  | { type: "log_line"; data: LogLine }
  | { type: "flows"; data: { flows: Flow[]; settings: FlowSettings } }
  | { type: "simulate_flow"; flowId: string }
  | { type: "particle_spawn"; data: { flowId: string; color: string; speed: number; path: string[] } };
