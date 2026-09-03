import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import type { MachineSnapshot } from "../contract.ts";
import { HostMonitorStore, hostMonitorMigrations, MAX_RENDER_POINTS } from "../store.ts";

function snapshot(sampledAtMs: number, cpuPercent: number): MachineSnapshot {
  const capacity = { totalBytes: 100, usedBytes: 50, availableBytes: 50, usagePercent: 50 };
  return {
    sampledAtMs,
    durationMs: 300,
    system: {
      hostname: "fixture",
      osName: "Fixture Linux",
      platform: "linux",
      arch: "x64",
      kernelRelease: "6.0",
      kernelVersion: "fixture",
      uptimeSeconds: 100,
      bootedAtMs: Math.max(0, sampledAtMs - 100_000),
    },
    network: { receiveBytesPerSecond: 1000, sendBytesPerSecond: 500 },
    cpu: { model: "Fixture CPU", logicalCores: 8, usagePercent: cpuPercent, loadAverage: [1, 2, 3] },
    memory: capacity,
    swap: null,
    disk: { path: "/", ...capacity },
    issues: [],
  };
}

test("append-only migrations upgrade the prior single-machine schema", () => {
  const db = new Database(":memory:");
  try {
    for (const migration of hostMonitorMigrations.slice(0, 10)) db.exec(migration);
    for (const migration of hostMonitorMigrations.slice(10)) db.exec(migration);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>;
    assert.ok(tables.some((table) => table.name === "machine_samples"));
    assert.ok(tables.some((table) => table.name === "fleet_samples"));
  } finally {
    db.close();
  }
});

test("history is isolated per host and never exceeds 720 relative buckets", () => {
  const db = new Database(":memory:");
  try {
    for (const migration of hostMonitorMigrations) db.exec(migration);
    const store = new HostMonitorStore(db);
    const since = 1_001;
    const until = since + 30 * 24 * 60 * 60_000;
    for (let index = 0; index <= 900; index += 1) {
      const at = Math.round(since + (until - since) * index / 900);
      store.insert("host-alpha", snapshot(at, index % 100));
    }
    store.insert("host-bravo", snapshot(until, 99));

    const alpha = store.history("host-alpha", since, until);
    const bravo = store.history("host-bravo", since, until);
    assert.ok(alpha.length > 0);
    assert.ok(alpha.length <= MAX_RENDER_POINTS);
    assert.ok(alpha.every((point) => point.collectedAtMs >= since));
    assert.deepEqual(bravo.map((point) => point.cpuPercent), [99]);
  } finally {
    db.close();
  }
});
