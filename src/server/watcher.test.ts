import { describe, expect, it } from "vitest";
import { computeMemoryBreakdown } from "./watcher";

describe("computeMemoryBreakdown", () => {
  it("subtracts inactive_file from usage (cgroup v2)", () => {
    // Real example from a busy DB container on cgroup v2
    const memStats = {
      usage: 2108977152,
      limit: 2147483648,
      stats: {
        anon: 77737984,
        file: 1996709888,
        inactive_file: 1811337216,
        active_file: 38223872,
      },
    };
    const r = computeMemoryBreakdown(memStats);
    expect(r.total).toBe(2108977152);
    expect(r.cache).toBe(1811337216);
    expect(r.anon).toBe(77737984);
    expect(r.limit).toBe(2147483648);
    // real = 2108977152 - 1811337216 = 297639936 (~283 MB, real usage)
    expect(r.real).toBe(297639936);
    // NOT the inflated value of 2108977152 (~2.01 GB)
    expect(r.real).toBeLessThan(memStats.usage);
  });

  it("uses total_inactive_file for cgroup v1", () => {
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
    // Prefers total_inactive_file over generic cache
    expect(r.cache).toBe(700000000);
    expect(r.anon).toBe(200000000); // total_rss
    expect(r.real).toBe(300000000);
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

  it("matches docker stats CLI for the user's reported case (~12% real vs 98% inflated)", () => {
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
    // After fix: shows ~14% (close to docker stats CLI's 12%)
    expect(realPercent).toBeLessThan(20);
    expect(realPercent).toBeGreaterThan(10);
  });
});
