import { describe, it, expect } from "vitest";
import { discoverConnections, isInfraService, isProxyService, isWorkerService } from "./docker";
import type { Service } from "../shared/types";

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

describe("isInfraService", () => {
  it("detects postgres by image", () => {
    expect(isInfraService(makeSvc({ image: "postgres:16" }))).toEqual({ type: "database", label: "postgres" });
  });

  it("detects redis by name", () => {
    expect(isInfraService(makeSvc({ name: "redis-cache" }))).toEqual({ type: "cache", label: "redis" });
  });

  it("returns null for app service", () => {
    expect(isInfraService(makeSvc({ name: "backend", image: "node:20" }))).toBeNull();
  });
});

describe("isProxyService", () => {
  it("detects nginx", () => {
    expect(isProxyService(makeSvc({ image: "nginx:latest" }))).toBe(true);
  });

  it("detects traefik by name", () => {
    expect(isProxyService(makeSvc({ name: "traefik" }))).toBe(true);
  });

  it("returns false for app service", () => {
    expect(isProxyService(makeSvc({ name: "api", image: "node:20" }))).toBe(false);
  });
});

describe("isWorkerService", () => {
  it("detects celery worker", () => {
    expect(isWorkerService(makeSvc({ name: "celery-worker" }))).toBe(true);
  });

  it("detects beat scheduler", () => {
    expect(isWorkerService(makeSvc({ name: "celery-beat" }))).toBe(true);
  });

  it("returns false for app service", () => {
    expect(isWorkerService(makeSvc({ name: "api" }))).toBe(false);
  });
});

describe("discoverConnections", () => {
  it("connects app to infra in same network", async () => {
    const services = [
      makeSvc({ uid: "proj/api", name: "api", image: "node:20", networks: ["backend"] }),
      makeSvc({ uid: "proj/db", name: "db", image: "postgres:16", networks: ["backend"] }),
    ];
    const conns = await discoverConnections(services);
    expect(conns).toEqual([
      { from: "proj/api", to: "proj/db", network: "", type: "database", label: "postgres" },
    ]);
  });

  it("does not connect services in different networks", async () => {
    const services = [
      makeSvc({ uid: "proj/api", name: "api", image: "node:20", networks: ["frontend"] }),
      makeSvc({ uid: "proj/db", name: "db", image: "postgres:16", networks: ["backend"] }),
    ];
    const conns = await discoverConnections(services);
    expect(conns).toEqual([]);
  });

  it("connects proxy to app in same network", async () => {
    const services = [
      makeSvc({ uid: "proj/nginx", name: "nginx", image: "nginx:latest", networks: ["frontend"] }),
      makeSvc({ uid: "proj/api", name: "api", image: "node:20", networks: ["frontend"] }),
    ];
    const conns = await discoverConnections(services);
    expect(conns).toEqual([
      { from: "proj/nginx", to: "proj/api", network: "", type: "proxy", label: "upstream" },
    ]);
  });

  it("connects worker to infra in same network", async () => {
    const services = [
      makeSvc({ uid: "proj/worker", name: "celery-worker", image: "app:latest", networks: ["backend"] }),
      makeSvc({ uid: "proj/redis", name: "redis", image: "redis:7", networks: ["backend"] }),
    ];
    const conns = await discoverConnections(services);
    expect(conns).toEqual([
      { from: "proj/worker", to: "proj/redis", network: "", type: "cache", label: "broker" },
    ]);
  });

  it("deduplicates connections", async () => {
    // A collector service that is also an app — should only get one connection to db
    const services = [
      makeSvc({ uid: "proj/collector", name: "collector", image: "node:20", networks: ["backend"] }),
      makeSvc({ uid: "proj/db", name: "db", image: "postgres:16", networks: ["backend"] }),
    ];
    const conns = await discoverConnections(services);
    // collector is both an app (not infra/proxy/worker) AND matches the collector rule
    // but deduplication should prevent duplicates
    const keys = conns.map((c) => `${c.from}:${c.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("handles full stack with multiple service types", async () => {
    const services = [
      makeSvc({ uid: "proj/nginx", name: "nginx", image: "nginx:latest", networks: ["frontend", "backend"] }),
      makeSvc({ uid: "proj/api", name: "api", image: "node:20", networks: ["frontend", "backend"] }),
      makeSvc({ uid: "proj/db", name: "db", image: "postgres:16", networks: ["backend"] }),
      makeSvc({ uid: "proj/redis", name: "redis", image: "redis:7", networks: ["backend"] }),
      makeSvc({ uid: "proj/worker", name: "celery-worker", image: "app:latest", networks: ["backend"] }),
    ];
    const conns = await discoverConnections(services);

    const has = (from: string, to: string) => conns.some((c) => c.from === from && c.to === to);

    expect(has("proj/api", "proj/db")).toBe(true);
    expect(has("proj/api", "proj/redis")).toBe(true);
    expect(has("proj/nginx", "proj/api")).toBe(true);
    expect(has("proj/worker", "proj/redis")).toBe(true);
    expect(has("proj/worker", "proj/db")).toBe(true);
    // proxy should NOT connect to infra
    expect(has("proj/nginx", "proj/db")).toBe(false);
    expect(has("proj/nginx", "proj/redis")).toBe(false);
  });
});
