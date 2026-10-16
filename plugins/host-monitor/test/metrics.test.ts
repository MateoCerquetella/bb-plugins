import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCapacity,
  calculateCpuUsage,
  calculateDiskCapacity,
  calculateLinuxMemory,
  parseProcMeminfo,
  selectThroughputInterfaceNames,
  type CpuInfoLike,
} from "../lib/metrics.ts";

function cpu(user: number, sys: number, idle: number): CpuInfoLike {
  return { model: "Fixture CPU", times: { user, nice: 0, sys, idle, irq: 0 } };
}

test("calculates aggregate machine-wide CPU utilization", () => {
  assert.equal(
    calculateCpuUsage(
      [cpu(100, 100, 800), cpu(100, 100, 800)],
      [cpu(150, 125, 825), cpu(150, 125, 825)],
    ),
    75,
  );
});

test("calculates validated byte capacities", () => {
  assert.deepEqual(calculateCapacity(1_000, 250), {
    totalBytes: 1_000,
    usedBytes: 750,
    availableBytes: 250,
    usagePercent: 75,
  });
  assert.throws(() => calculateCapacity(100, 101), /cannot exceed/u);
});

test("uses Linux MemAvailable for memory pressure", () => {
  const values = parseProcMeminfo("MemTotal: 1000 kB\nMemAvailable: 250 kB\n");
  assert.deepEqual(calculateLinuxMemory(values), {
    capacity: {
      totalBytes: 1_024_000,
      usedBytes: 768_000,
      availableBytes: 256_000,
      usagePercent: 75,
    },
    estimatedAvailable: false,
  });
});

test("aggregates throughput only from useful non-loopback interfaces", () => {
  const selected = selectThroughputInterfaceNames({
    loopback: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    ethernet: [{ address: "192.0.2.10", family: "IPv4", internal: false }],
    linkLocal: [{ address: "169.254.1.2", family: "IPv4", internal: false }],
  });
  assert.deepEqual([...selected], ["ethernet"]);
});

test("calculates root filesystem capacity", () => {
  assert.deepEqual(calculateDiskCapacity({ bsize: 100, blocks: 10, bfree: 4, bavail: 3 }), {
    totalBytes: 1_000,
    usedBytes: 600,
    availableBytes: 300,
    usagePercent: 66.6666,
  });
});
