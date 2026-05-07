import type { Service } from "../../shared/types";

export interface ProcessingEntry {
  expected: Service["state"];
  startedAt: number;
  minDuration: number;
}

export function arraysEqual(a: Service[], b: Service[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].uid !== b[i].uid) return false;
    if (a[i].state !== b[i].state) return false;
  }
  return true;
}

export function applyProcessing(
  raw: Service[],
  processing: Map<string, ProcessingEntry>,
  now = Date.now(),
): Service[] {
  if (processing.size === 0) return raw;
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
    // Stop/remove expects "exited" but Docker may report "crashed" or "dead" (non-zero exit from SIGTERM/SIGKILL)
    if (entry.expected === "exited" && (s.state === "crashed" || s.state === "dead" || s.state === "exited")) {
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
}
