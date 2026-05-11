import { describe, it, expect } from "vitest";
import { applyProcessing, arraysEqual, type ProcessingEntry } from "./processing";
import type { Service } from "../../shared/types";

function makeSvc(overrides: Partial<Service> = {}): Service {
  return {
    id: "abc123",
    uid: "proj/svc",
    name: "svc",
    image: "node:20",
    state: "running",
    status: "Up 5 minutes",
    ports: [],
    networks: ["default"],
    network_ips: {},
    project: "proj",
    compose_file: "",
    env: [],
    restart_policy: "",
    memory_limit: 0,
    cpu_quota: 0,
    health_status: "",
    health_log: [],
    exit_code: 0,
    restart_count: 0,
    oom_killed: false,
    mounts: [],
    ...overrides,
  };
}

describe("arraysEqual", () => {
  it("returns true for identical arrays", () => {
    const a = [makeSvc({ uid: "a", state: "running" })];
    expect(arraysEqual(a, a)).toBe(true);
  });

  it("returns false for different lengths", () => {
    const a = [makeSvc()];
    expect(arraysEqual(a, [])).toBe(false);
  });

  it("returns false when uid differs", () => {
    const a = [makeSvc({ uid: "a" })];
    const b = [makeSvc({ uid: "b" })];
    expect(arraysEqual(a, b)).toBe(false);
  });

  it("returns false when state differs", () => {
    const a = [makeSvc({ uid: "a", state: "running" })];
    const b = [makeSvc({ uid: "a", state: "exited" })];
    expect(arraysEqual(a, b)).toBe(false);
  });

  it("returns true when uid and state match despite other differences", () => {
    const a = [makeSvc({ uid: "a", state: "running", image: "node:18" })];
    const b = [makeSvc({ uid: "a", state: "running", image: "node:20" })];
    expect(arraysEqual(a, b)).toBe(true);
  });
});

describe("applyProcessing", () => {
  it("returns raw unchanged when no processing entries", () => {
    const raw = [makeSvc()];
    const processing = new Map<string, ProcessingEntry>();
    expect(applyProcessing(raw, processing)).toBe(raw);
  });

  it("shows processing state when minDuration has not elapsed", () => {
    const now = 10000;
    const raw = [makeSvc({ uid: "proj/svc", state: "exited" })];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/svc", { expected: "running", startedAt: 9000, minDuration: 2000 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("processing");
    // Entry should NOT be deleted yet
    expect(processing.has("proj/svc")).toBe(true);
  });

  it("clears processing when state matches expected after minDuration", () => {
    const now = 12000;
    const raw = [makeSvc({ uid: "proj/svc", state: "running" })];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/svc", { expected: "running", startedAt: 9000, minDuration: 2000 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("running");
    expect(processing.has("proj/svc")).toBe(false);
  });

  it("crashed matches expected exited (stop bug)", () => {
    const now = 12000;
    const raw = [makeSvc({ uid: "proj/svc", state: "crashed" })];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/svc", { expected: "exited", startedAt: 9000, minDuration: 2000 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("crashed");
    expect(processing.has("proj/svc")).toBe(false);
  });

  it("dead matches expected exited", () => {
    const now = 12000;
    const raw = [makeSvc({ uid: "proj/svc", state: "dead" })];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/svc", { expected: "exited", startedAt: 9000, minDuration: 2000 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("dead");
    expect(processing.has("proj/svc")).toBe(false);
  });

  it("crashed clears processing when expected is running (crash on start)", () => {
    const now = 12000;
    const raw = [makeSvc({ uid: "proj/svc", state: "crashed" })];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/svc", { expected: "running", startedAt: 9000, minDuration: 2000 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("crashed");
    expect(processing.has("proj/svc")).toBe(false);
  });

  it("15s timeout clears processing as safety net", () => {
    const startedAt = 1000;
    const now = startedAt + 16000; // > 15s
    const raw = [makeSvc({ uid: "proj/svc", state: "exited" })];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/svc", { expected: "running", startedAt, minDuration: 0 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("exited");
    expect(processing.has("proj/svc")).toBe(false);
  });

  it("keeps processing when state does not match and within timeout", () => {
    const now = 5000;
    const raw = [makeSvc({ uid: "proj/svc", state: "exited" })];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/svc", { expected: "running", startedAt: 3000, minDuration: 0 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("processing");
    expect(processing.has("proj/svc")).toBe(true);
  });

  it("does not affect services without processing entries", () => {
    const now = 5000;
    const raw = [
      makeSvc({ uid: "proj/a", state: "running" }),
      makeSvc({ uid: "proj/b", state: "exited" }),
    ];
    const processing = new Map<string, ProcessingEntry>([
      ["proj/a", { expected: "exited", startedAt: 3000, minDuration: 0 }],
    ]);
    const result = applyProcessing(raw, processing, now);
    expect(result[0].state).toBe("processing"); // a is processing
    expect(result[1].state).toBe("exited"); // b unchanged
  });
});
