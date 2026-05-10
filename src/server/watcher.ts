import { docker } from "./docker";
import type { Service, Stats, DockerEvent } from "../shared/types";

/** Compute real memory usage by subtracting reclaimable page cache.
 *  Mirrors `docker stats` CLI logic. Works for cgroup v1 and v2.
 *
 *  Why: memory_stats.usage includes the kernel page cache (file-backed pages
 *  the kernel keeps in RAM "just in case"). That cache is INSTANTLY reclaimable
 *  under memory pressure and is NOT real usage. Containers with heavy I/O
 *  (DBs, collectors) appear at 90-100% when actually using 10-15%.
 *
 *  Returns: { real, cache, anon, total, limit } all in bytes. */
export function computeMemoryBreakdown(memoryStats: any): {
  real: number;
  cache: number;
  anon: number;
  total: number;
  limit: number;
} {
  const total = memoryStats?.usage ?? 0;
  const limit = memoryStats?.limit ?? 0;
  const s = memoryStats?.stats ?? {};
  // cgroup v2: 'inactive_file'
  // cgroup v1: 'total_inactive_file' (recursive) or 'cache' (legacy)
  const cache = s.inactive_file ?? s.total_inactive_file ?? s.cache ?? 0;
  // anon = process memory (heap, stack). cgroup v2: 'anon'. cgroup v1: 'rss' or 'total_rss'.
  const anon = s.anon ?? s.total_rss ?? s.rss ?? 0;
  const real = Math.max(0, total - cache);
  return { real, cache, anon, total, limit };
}

export async function pollStats(services: Service[]): Promise<Stats[]> {
  const running = services.filter((s) => s.state === "running");
  const results: Stats[] = [];

  for (const svc of running) {
    try {
      const container = docker.getContainer(svc.id);
      const raw = await Promise.race([
        container.stats({ stream: false }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]) as any;

      const cpuDelta =
        raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
      const sysDelta =
        raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;

      const onlineCpus = raw.cpu_stats.online_cpus || 1;
      const cpuHost =
        sysDelta > 0
          ? (cpuDelta / sysDelta) * onlineCpus * 100
          : 0;

      // If container has a CPU limit, show % relative to its allocation
      // cpu_quota: 100000 = 1 core; cpuHost: % of one host core
      const cpu = svc.cpu_quota > 0
        ? (cpuHost * 100000 / svc.cpu_quota)
        : cpuHost;

      const mb = computeMemoryBreakdown(raw.memory_stats);
      const memLimit = mb.limit || 1;
      const TO_MB = 1024 * 1024;

      results.push({
        service: svc.uid,
        cpu: parseFloat(cpu.toFixed(2)),
        mem_mb: parseFloat((mb.real / TO_MB).toFixed(1)),
        mem_percent: parseFloat(((mb.real / memLimit) * 100).toFixed(1)),
        mem_breakdown: {
          anon_mb: parseFloat((mb.anon / TO_MB).toFixed(1)),
          cache_mb: parseFloat((mb.cache / TO_MB).toFixed(1)),
          total_mb: parseFloat((mb.total / TO_MB).toFixed(1)),
          limit_mb: parseFloat((mb.limit / TO_MB).toFixed(1)),
        },
      });
    } catch {
      // Container may have stopped between discovery and stats
    }
  }

  return results;
}

export function watchDockerEvents(onEvent: (event: DockerEvent) => void) {
  docker.getEvents({}, (err, stream) => {
    if (err || !stream) {
      console.error("Failed to watch Docker events:", err);
      return;
    }

    let buffer = "";

    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          if (event.Type !== "container") continue;

          const action = event.Action?.split(":")[0]; // "health_status: healthy" → "health_status"
          if (!["start", "stop", "die", "restart", "destroy", "create", "health_status"].includes(action)) continue;

          const svcName =
            event.Actor?.Attributes?.["com.docker.compose.service"] ||
            event.Actor?.Attributes?.name ||
            "unknown";
          const svcProject =
            event.Actor?.Attributes?.["com.docker.compose.project"] ||
            "standalone";
          onEvent({
            type: "docker",
            action,
            service: `${svcProject}/${svcName}`,
            time: event.time || Date.now() / 1000,
          });
        } catch {
          // Ignore malformed lines
        }
      }
    });
  });
}
