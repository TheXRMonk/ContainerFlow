import { docker } from "./docker";
import type { Service, Stats, DockerEvent } from "../shared/types";

export async function pollStats(services: Service[]): Promise<Stats[]> {
  const running = services.filter((s) => s.state === "running");
  const results: Stats[] = [];

  for (const svc of running) {
    try {
      const container = docker.getContainer(svc.id);
      const raw = await container.stats({ stream: false });

      const cpuDelta =
        raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
      const sysDelta =
        raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;

      const cpu =
        sysDelta > 0
          ? (cpuDelta / sysDelta) * (raw.cpu_stats.online_cpus || 1) * 100
          : 0;

      const memUsage = raw.memory_stats.usage || 0;
      const memLimit = raw.memory_stats.limit || 1;

      results.push({
        service: svc.uid,
        cpu: parseFloat(cpu.toFixed(2)),
        mem_mb: parseFloat((memUsage / 1024 / 1024).toFixed(1)),
        mem_percent: parseFloat(((memUsage / memLimit) * 100).toFixed(1)),
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
