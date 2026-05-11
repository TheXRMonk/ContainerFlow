import { describe, expect, it } from "vitest";
import { computeMemoryBreakdown } from "./watcher";

describe("computeMemoryBreakdown", () => {
  it("subtracts active_file + inactive_file from usage (cgroup v2)", () => {
    // Real example from a busy DB container on cgroup v2
    const memStats = {
      usage: 2108977152,
      limit: 2147483648,
      stats: {
        anon: 77737984,
        file: 1996709888,           // some kernels include shmem here — we avoid this
        inactive_file: 1811337216,
        active_file: 38223872,
      },
    };
    const r = computeMemoryBreakdown(memStats);
    expect(r.total).toBe(2108977152);
    // We use active+inactive (= 1849561088), NOT `file` which can include shmem
    expect(r.cache).toBe(1849561088);
    expect(r.anon).toBe(77737984);
    expect(r.limit).toBe(2147483648);
    // real = 2108977152 - 1849561088 = 259416064 (~247 MB)
    expect(r.real).toBe(259416064);
    expect(r.real).toBeLessThan(memStats.usage);
  });

  it("falls back to active_file + inactive_file when `file` not present", () => {
    const memStats = {
      usage: 1000000000,
      limit: 2000000000,
      stats: {
        anon: 200000000,
        active_file: 600000000,
        inactive_file: 200000000,
      },
    };
    const r = computeMemoryBreakdown(memStats);
    expect(r.cache).toBe(800000000); // active + inactive
    expect(r.real).toBe(200000000);
  });

  it("uses total cache for cgroup v1 (full page cache, not just inactive)", () => {
    const memStats = {
      usage: 1000000000,
      limit: 2000000000,
      stats: {
        total_rss: 200000000,
        total_inactive_file: 700000000,
        cache: 800000000,
      },
    };
    const r = computeMemoryBreakdown(memStats);
    // Prefers `cache` (total page cache) over partial total_inactive_file
    expect(r.cache).toBe(800000000);
    expect(r.anon).toBe(200000000); // total_rss
    expect(r.real).toBe(200000000);
  });

  it("falls back to cache field for legacy cgroup v1", () => {
    const memStats = {
      usage: 500000000,
      limit: 1000000000,
      stats: {
        rss: 100000000,
        cache: 350000000,
      },
    };
    const r = computeMemoryBreakdown(memStats);
    expect(r.cache).toBe(350000000);
    expect(r.anon).toBe(100000000); // rss
    expect(r.real).toBe(150000000);
  });

  it("clamps negative real usage to 0", () => {
    // Edge case: stats reports cache > usage (race condition)
    const memStats = {
      usage: 100000000,
      limit: 1000000000,
      stats: {
        inactive_file: 150000000,
      },
    };
    const r = computeMemoryBreakdown(memStats);
    expect(r.real).toBe(0);
  });

  it("handles missing stats gracefully", () => {
    const memStats = { usage: 100000000, limit: 1000000000 };
    const r = computeMemoryBreakdown(memStats);
    expect(r.cache).toBe(0);
    expect(r.anon).toBe(0);
    expect(r.real).toBe(100000000); // no cache to subtract, real = total
    expect(r.total).toBe(100000000);
  });

  it("handles completely empty input", () => {
    const r = computeMemoryBreakdown(undefined);
    expect(r.real).toBe(0);
    expect(r.cache).toBe(0);
    expect(r.anon).toBe(0);
    expect(r.total).toBe(0);
    expect(r.limit).toBe(0);
  });

  it("excludes all file cache for accurate DB container reading", () => {
    // From the bug report: ninjasagacw-db-1 cgroup v2
    const memStats = {
      usage: 2108977152, // 2.01 GB raw
      limit: 2147483648, // 2.0 GB limit
      stats: {
        anon: 77737984,
        inactive_file: 1811337216,
        active_file: 38223872,
      },
    };
    const r = computeMemoryBreakdown(memStats);
    const realPercent = (r.real / r.limit) * 100;
    const rawPercent = (r.total / r.limit) * 100;
    // Before fix: would show ~98%
    expect(rawPercent).toBeGreaterThan(95);
    // After fix: subtracting all file cache → much lower (~13% in this case)
    expect(realPercent).toBeLessThan(20);
  });
});
