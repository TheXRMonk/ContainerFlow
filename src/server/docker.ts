import Docker from "dockerode";
import type { Service, Connection, LogLine } from "../shared/types";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export { docker };

export async function discoverServices(all: boolean, projects: string[]): Promise<Service[]> {
  const containers = await docker.listContainers({ all: true });

  let services: Service[] = containers.map((c) => {
    const name = c.Labels["com.docker.compose.service"] || c.Names[0]?.replace("/", "") || "unknown";
    const project = c.Labels["com.docker.compose.project"] || "standalone";
    return {
      id: c.Id.slice(0, 12),
      uid: `${project}/${name}`,
      name,
      image: c.Image,
      state: c.State as Service["state"],
      status: c.Status,
      ports: [...new Map(
        c.Ports.filter((p) => p.PublicPort).map((p) => [
          `${p.PublicPort}:${p.PrivatePort}`,
          { host: p.PublicPort!, container: p.PrivatePort },
        ])
      ).values()],
      networks: Object.keys(c.NetworkSettings?.Networks || {}),
      project,
      compose_file: c.Labels["com.docker.compose.project.config_files"] || "",
    };
  });

  if (!all && projects.length > 0) {
    services = services.filter((s) => projects.includes(s.project));
  }

  return services;
}

// ── Infrastructure service detection ──
// These are services that OTHER services connect TO (databases, caches, brokers, proxies)

const INFRA_PATTERNS: { pattern: string; type: string; label: string; role: "target" }[] = [
  { pattern: "postgres", type: "database", label: "postgres", role: "target" },
  { pattern: "mysql", type: "database", label: "mysql", role: "target" },
  { pattern: "mariadb", type: "database", label: "mariadb", role: "target" },
  { pattern: "mongo", type: "database", label: "mongo", role: "target" },
  { pattern: "redis", type: "cache", label: "redis", role: "target" },
  { pattern: "memcached", type: "cache", label: "memcached", role: "target" },
  { pattern: "rabbitmq", type: "broker", label: "rabbitmq", role: "target" },
  { pattern: "kafka", type: "broker", label: "kafka", role: "target" },
  { pattern: "nats", type: "broker", label: "nats", role: "target" },
];

const PROXY_PATTERNS = ["nginx", "traefik", "haproxy", "caddy", "envoy"];

function isInfraService(svc: Service): { type: string; label: string } | null {
  const img = svc.image.toLowerCase();
  const name = svc.name.toLowerCase();
  for (const p of INFRA_PATTERNS) {
    if (img.includes(p.pattern) || name.includes(p.pattern)) {
      return { type: p.type, label: p.label };
    }
  }
  return null;
}

function isProxyService(svc: Service): boolean {
  const img = svc.image.toLowerCase();
  const name = svc.name.toLowerCase();
  return PROXY_PATTERNS.some((p) => img.includes(p) || name.includes(p));
}

function isWorkerService(svc: Service): boolean {
  const name = svc.name.toLowerCase();
  return name.includes("celery") || name.includes("worker") || name.includes("beat") || name.includes("cron");
}

export async function discoverConnections(services: Service[]): Promise<Connection[]> {
  const connections: Connection[] = [];
  const seen = new Set<string>();

  // Separate services by role
  const infraServices = services.filter((s) => isInfraService(s));
  const proxyServices = services.filter((s) => isProxyService(s));
  const workerServices = services.filter((s) => isWorkerService(s));
  const appServices = services.filter(
    (s) => !isInfraService(s) && !isProxyService(s) && !isWorkerService(s)
  );

  function addConnection(from: string, to: string, type: string, label: string) {
    const key = `${from}:${to}`;
    if (seen.has(key) || from === to) return;
    seen.add(key);
    connections.push({ from, to, network: "", type, label });
  }

  // 1. App services → infra services (backend→db, backend→redis, etc.)
  for (const app of appServices) {
    // Each app connects to DB and cache in the same network
    for (const infra of infraServices) {
      const hasSharedNetwork = app.networks.some((n) => infra.networks.includes(n));
      if (!hasSharedNetwork) continue;
      const edge = isInfraService(infra)!;
      addConnection(app.uid, infra.uid, edge.type, edge.label);
    }
  }

  // 2. Workers → infra (celery→redis as broker, celery→db)
  for (const worker of workerServices) {
    for (const infra of infraServices) {
      const hasSharedNetwork = worker.networks.some((n) => infra.networks.includes(n));
      if (!hasSharedNetwork) continue;
      const edge = isInfraService(infra)!;
      const label = edge.type === "cache" ? "broker" : edge.label;
      addConnection(worker.uid, infra.uid, edge.type, label);
    }
  }

  // 3. Proxy → app services (nginx→backend, nginx→frontend, nginx→auth)
  for (const proxy of proxyServices) {
    for (const app of appServices) {
      const hasSharedNetwork = proxy.networks.some((n) => app.networks.includes(n));
      if (!hasSharedNetwork) continue;
      addConnection(proxy.uid, app.uid, "proxy", "upstream");
    }
  }

  // 4. Collector → infra (special: collector writes to db and redis)
  for (const svc of services) {
    if (svc.name.toLowerCase().includes("collector")) {
      for (const infra of infraServices) {
        const hasSharedNetwork = svc.networks.some((n) => infra.networks.includes(n));
        if (!hasSharedNetwork) continue;
        const edge = isInfraService(infra)!;
        addConnection(svc.uid, infra.uid, edge.type, edge.label);
      }
    }
  }

  return connections;
}

// ── Container logs ──

export async function getContainerLogs(id: string, tail = 200): Promise<LogLine[]> {
  const container = docker.getContainer(id);
  const logBuffer = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });

  const lines: LogLine[] = [];
  const raw = Buffer.isBuffer(logBuffer) ? logBuffer : Buffer.from(logBuffer as any);

  let offset = 0;
  while (offset < raw.length) {
    if (offset + 8 > raw.length) break;
    const streamType = raw[offset];
    const size = raw.readUInt32BE(offset + 4);
    if (offset + 8 + size > raw.length) break;

    const payload = raw.slice(offset + 8, offset + 8 + size).toString("utf-8").trimEnd();
    offset += 8 + size;

    if (!payload) continue;

    // Timestamp is at the start: "2024-01-01T00:00:00.000000000Z rest of line"
    const spaceIdx = payload.indexOf(" ");
    const timestamp = spaceIdx > 0 ? payload.slice(0, spaceIdx) : "";
    const line = spaceIdx > 0 ? payload.slice(spaceIdx + 1) : payload;

    lines.push({
      container: id,
      line,
      timestamp,
      stream: streamType === 2 ? "stderr" : "stdout",
    });
  }

  return lines;
}

export function streamContainerLogs(
  id: string,
  onLine: (line: LogLine) => void,
): { destroy: () => void } {
  const container = docker.getContainer(id);
  let stream: NodeJS.ReadableStream | null = null;
  let destroyed = false;

  container.logs({
    stdout: true,
    stderr: true,
    follow: true,
    since: Math.floor(Date.now() / 1000),
    timestamps: true,
  }).then((s) => {
    if (destroyed) {
      if (s && typeof (s as any).destroy === "function") (s as any).destroy();
      return;
    }
    stream = s as unknown as NodeJS.ReadableStream;

    // Docker multiplexed stream parsing for follow mode
    let buffer = Buffer.alloc(0);

    stream.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 8) {
        const streamType = buffer[0];
        const size = buffer.readUInt32BE(4);
        if (buffer.length < 8 + size) break;

        const payload = buffer.slice(8, 8 + size).toString("utf-8").trimEnd();
        buffer = buffer.slice(8 + size);

        if (!payload) continue;

        const spaceIdx = payload.indexOf(" ");
        const timestamp = spaceIdx > 0 ? payload.slice(0, spaceIdx) : "";
        const line = spaceIdx > 0 ? payload.slice(spaceIdx + 1) : payload;

        onLine({
          container: id,
          line,
          timestamp,
          stream: streamType === 2 ? "stderr" : "stdout",
        });
      }
    });
  }).catch(() => {});

  return {
    destroy() {
      destroyed = true;
      if (stream && typeof (stream as any).destroy === "function") {
        (stream as any).destroy();
      }
    },
  };
}
