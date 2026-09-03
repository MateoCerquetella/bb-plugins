import assert from "node:assert/strict";
import test from "node:test";

import { bucketSizeFor, collectDirectorySamples, collectMemoryDiagnostics, cpuPercent, describeProcessWorkload, memoryPressureActive, MONITORED_DIRECTORIES, parseCpuCounters, parseMeminfo, parseMemoryPressure, parseProcessStat, parseVmstat, SAMPLE_INTERVAL_MS } from "../monitor.ts";

test("parses Linux memory facts", () => {
  assert.deepEqual(parseMeminfo("MemTotal:       1024 kB\nMemAvailable:    256 kB\n"), { total: 1_048_576, available: 262_144 });
});

test("calculates CPU utilization from consecutive counters", () => {
  assert.equal(cpuPercent(null, { total: 200, idle: 100 }), null);
  assert.equal(cpuPercent({ total: 100, idle: 70 }, { total: 200, idle: 120 }), 50);
  assert.equal(cpuPercent({ total: 100, idle: 70 }, { total: 100, idle: 70 }), null);
  assert.deepEqual(parseCpuCounters("cpu  1 2 3 4 5 6 7 8\n"), { total: 36, idle: 9 });
});

test("uses bounded history buckets", () => {
  assert.equal(bucketSizeFor(60 * 60_000), SAMPLE_INTERVAL_MS);
  assert.ok(bucketSizeFor(30 * 24 * 60 * 60_000) >= SAMPLE_INTERVAL_MS);
});

test("includes the requested local directory breakdown", () => {
  assert.deepEqual(MONITORED_DIRECTORIES.map((entry) => entry.id), ["go", "rust", "bun", "pnpm", "npm", "tmp", "bb"]);
});

test("parses bounded memory-pressure and process diagnostics", () => {
  assert.deepEqual(parseMemoryPressure("some avg10=1.25 avg60=0.00 avg300=0.00 total=1\nfull avg10=0.25 avg60=0.00 avg300=0.00 total=1\n"), { some: 1.25, full: 0.25 });
  assert.deepEqual(parseVmstat("pswpin 2\npswpout 3\nworkingset_refault_anon 5\nworkingset_refault_file 7\npgscan_kswapd 11\npgscan_direct 13\n"), { swapInPages: 2, swapOutPages: 3, refaultPages: 12, reclaimPages: 24 });
  assert.deepEqual(parseProcessStat("42 (node worker) S 0 0 0 0 0 0 8 0 2 0 0 0 0 0 0 0 0 0 99 0 4 0", 4096), { pid: 42, name: "node worker", startTime: 99, minorFaults: 8, majorFaults: 2, rssBytes: 16_384 });
  assert.equal(memoryPressureActive({ collectedAt: 0, processDetailsCollectedAt: null, sampleIntervalMs: null, pressureSomePercent: 0.1, pressureFullPercent: 0, swapInPagesPerSecond: null, swapOutPagesPerSecond: null, refaultPagesPerSecond: null, reclaimPagesPerSecond: null, bbCgroupMemoryBytes: null, processes: [] }), true);
});

test("stops optional collectors before they begin after cancellation", async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(collectDirectorySamples(Date.now(), signal), { name: "AbortError" });
  await assert.rejects(collectMemoryDiagnostics(null, Date.now(), signal), { name: "AbortError" });
});

test("does not enumerate processes while attribution is disabled", async () => {
  const result = await collectMemoryDiagnostics(null, Date.now(), undefined, {
    includeProcesses: true,
    includeProcessDetails: false,
  });
  assert.deepEqual(result.diagnostics.processes, []);
  assert.deepEqual([...result.state.processes], []);
  assert.equal(result.diagnostics.processDetailsCollectedAt, null);
});

test("labels Bun processes by their workload without exposing full command lines", () => {
  assert.deepEqual(describeProcessWorkload({
    name: "bun", args: ["bun", "/home/ubuntu/.local/share/rosetta-machine/phosphor-monorepo/pkg/@application-hosts/links-server/src/main-local.ts"], cwd: "/home/ubuntu/.local/share/rosetta-machine/phosphor-monorepo", cgroup: "/user.slice/user-1000.slice/user@1000.service/app.slice/bb.service",
  }), { workload: "Bun · Links Server", workloadDetail: "Application host" });
  assert.deepEqual(describeProcessWorkload({ name: "bun", args: ["bun", "pkg/@application-hosts/local-dev-server/src/main-local.ts"], cwd: "/home/ubuntu/.local/share/rosetta-machine/phosphor-monorepo", cgroup: null }), { workload: "Bun · Local Dev Server", workloadDetail: "Application host" });
  assert.deepEqual(describeProcessWorkload({ name: "bun", args: ["bun", "/home/ubuntu/.codex-subscription-router/lib/versions/a-revision/router.mjs"], cwd: null, cgroup: null }), { workload: "Bun · Codex Subscription Router", workloadDetail: "Service" });
  assert.deepEqual(describeProcessWorkload({ name: "bun", args: ["bun"], cwd: null, cgroup: "0::/user.slice/user-1000.slice/user@1000.service/app.slice/bb.service" }), { workload: "Bun process", workloadDetail: "Bb" });
});
