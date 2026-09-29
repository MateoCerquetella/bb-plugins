import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { machineSnapshotSchema } from "../contract.ts";
import {
  calculateCapacity,
  calculateCpuUsage,
  calculateDiskCapacity,
  calculateLinuxMemory,
  calculateLinuxSwap,
  calculateMacMemory,
  collectExtraDisks,
  collectMachineSnapshot,
  parseMacSwapUsage,
  parseOsRelease,
  parseProcMeminfo,
  parseSwVers,
  parseVmStat,
  selectPrimaryIpAddress,
  selectThroughputInterfaceNames,
  type CpuInfoLike,
} from "../lib/metrics.ts";

function cpu(
  user: number,
  sys: number,
  idle: number,
  overrides: Partial<CpuInfoLike["times"]> = {},
): CpuInfoLike {
  return {
    model: "Fixture CPU",
    times: {
      user,
      nice: 0,
      sys,
      idle,
      irq: 0,
      ...overrides,
    },
  };
}

function assertStrictJson(value: unknown, path = "value"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} should be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertStrictJson(entry, `${path}[${index}]`));
    return;
  }
  assert.equal(typeof value, "object", `${path} should be JSON-compatible`);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    assert.notEqual(entry, undefined, `${path}.${key} should not be undefined`);
    assertStrictJson(entry, `${path}.${key}`);
  }
}

test("calculates aggregate machine-wide CPU utilization", () => {
  const before = [cpu(100, 100, 800), cpu(100, 100, 800)];
  const after = [cpu(150, 125, 825), cpu(150, 125, 825)];

  assert.equal(calculateCpuUsage(before, after), 75);
});

test("selects one useful non-loopback IPv4 address without interface metadata", () => {
  const address = selectPrimaryIpAddress({
    loopback: [
      { address: "127.0.0.1", family: "IPv4", internal: false },
      { address: "::1", family: "IPv6", internal: false },
      {
        address: "::ffff:127.0.0.1",
        family: "IPv6",
        internal: false,
      },
    ],
    tunnel: [
      {
        address: "2001:0DB8:0000:0000:0000:0000:0000:0042",
        family: "IPv6",
        internal: false,
      },
    ],
    ethernet: [
      { address: "192.168.50.12", family: "IPv4", internal: false },
    ],
  });

  assert.equal(address, "192.168.50.12");
});

test("canonicalizes IPv6 while dropping its interface zone identifier", () => {
  const address = selectPrimaryIpAddress({
    ignored: [
      { address: "169.254.1.2", family: 4, internal: false },
      { address: "fe80::1%en0", family: 6, internal: false },
    ],
    primary: [
      {
        address: "2001:0DB8:0000:0000:0000:0000:0000:0042%private0",
        family: 6,
        internal: false,
      },
    ],
  });

  assert.equal(address, "2001:db8::42");
  assert.equal(address?.includes("private0"), false);
});

test("returns null when interfaces expose no useful unicast address", () => {
  assert.equal(
    selectPrimaryIpAddress({
      internal: [
        { address: "10.0.0.5", family: "IPv4", internal: true },
      ],
      unusable: [
        { address: "0.0.0.0", family: "IPv4", internal: false },
        { address: "224.0.0.1", family: "IPv4", internal: false },
        { address: "ff02::1", family: "IPv6", internal: false },
        { address: "not-an-address", family: "IPv4", internal: false },
      ],
    }),
    null,
  );
});

test("selects only address-owning interfaces for throughput aggregation", () => {
  const selected = selectThroughputInterfaceNames({
    loopback: [
      { address: "127.0.0.1", family: "IPv4", internal: true },
    ],
    addresslessVirtualPair: undefined,
    linkLocal: [
      { address: "169.254.1.2", family: "IPv4", internal: false },
    ],
    ethernet: [
      { address: "192.0.2.10", family: "IPv4", internal: false },
    ],
    vpn: [
      { address: "2001:db8::42", family: "IPv6", internal: false },
    ],
  });

  assert.deepEqual([...selected], ["ethernet", "vpn"]);
});

test("rejects missing, changed, and regressing CPU counters", () => {
  assert.throws(() => calculateCpuUsage([], []), /unavailable/);
  assert.throws(
    () => calculateCpuUsage([cpu(1, 1, 8)], [cpu(2, 2, 9), cpu(2, 2, 9)]),
    /topology changed/,
  );
  assert.throws(
    () => calculateCpuUsage([cpu(10, 10, 80)], [cpu(9, 10, 80)]),
    /regressed|did not advance/,
  );
});

test("calculates capacities and validates byte relationships", () => {
  assert.deepEqual(calculateCapacity(1_000, 250), {
    totalBytes: 1_000,
    usedBytes: 750,
    availableBytes: 250,
    usagePercent: 75,
  });
  assert.deepEqual(calculateCapacity(0, 0), {
    totalBytes: 0,
    usedBytes: 0,
    availableBytes: 0,
    usagePercent: 0,
  });
  assert.throws(() => calculateCapacity(100, 101), /cannot exceed/);
  assert.throws(() => calculateCapacity(Number.NaN, 0), /safe integer/);
});

test("parses Linux MemAvailable and swap in kibibytes", () => {
  const values = parseProcMeminfo(`
MemTotal:       1000 kB
MemFree:         100 kB
MemAvailable:    250 kB
Buffers:          20 kB
Cached:          200 kB
SReclaimable:     50 kB
Shmem:            10 kB
SwapTotal:       500 kB
SwapFree:        100 kB
`);

  assert.deepEqual(calculateLinuxMemory(values), {
    capacity: {
      totalBytes: 1_024_000,
      usedBytes: 768_000,
      availableBytes: 256_000,
      usagePercent: 75,
    },
    estimatedAvailable: false,
  });
  assert.deepEqual(calculateLinuxSwap(values), {
    totalBytes: 512_000,
    usedBytes: 409_600,
    availableBytes: 102_400,
    usagePercent: 80,
  });
});

test("estimates Linux available memory when MemAvailable is absent", () => {
  const values = parseProcMeminfo(`
MemTotal:       1000 kB
MemFree:         100 kB
Buffers:          20 kB
Cached:          200 kB
SReclaimable:     50 kB
Shmem:            10 kB
`);
  const result = calculateLinuxMemory(values);

  assert.equal(result.estimatedAvailable, true);
  assert.equal(result.capacity.availableBytes, 360 * 1_024);
  assert.equal(result.capacity.usagePercent, 64);
  assert.equal(calculateLinuxSwap(values), null);
});

test("rejects incomplete or inconsistent Linux counters independently", () => {
  assert.throws(() => calculateLinuxMemory(parseProcMeminfo("MemFree: 1 kB")), /MemTotal/);
  assert.throws(
    () =>
      calculateLinuxSwap(
        parseProcMeminfo("SwapTotal: 10 kB\nSwapFree: 11 kB\n"),
      ),
    /inconsistent/,
  );
});

test("parses os-release as data without evaluating it", () => {
  const release = parseOsRelease(String.raw`
NAME="Demo \"Linux\""
PRETTY_NAME="Demo Linux 42"
VERSION_ID=42
# IGNORED=value
`);

  assert.equal(release.NAME, 'Demo "Linux"');
  assert.equal(release.PRETTY_NAME, "Demo Linux 42");
  assert.equal(release.VERSION_ID, "42");
  assert.equal(release.IGNORED, undefined);
});

test("parses macOS vm_stat using the reported 16 KiB page size", () => {
  const parsed = parseVmStat(`
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                              100.
Pages active:                            500.
Pages inactive:                          200.
Pages speculative:                        50.
Pages wired down:                        100.
`);
  const result = calculateMacMemory(parsed, 1_000 * 16_384);

  assert.equal(parsed.pageSizeBytes, 16_384n);
  assert.deepEqual(result, {
    totalBytes: 16_384_000,
    usedBytes: 10_649_600,
    availableBytes: 5_734_400,
    usagePercent: 65,
  });
});

test("rejects malformed vm_stat output and clamps racing page totals", () => {
  assert.throws(() => parseVmStat("Pages free: 1."), /page size/);
  const parsed = parseVmStat(`
Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free: 1000.
Pages inactive: 1000.
Pages speculative: 1000.
`);
  assert.deepEqual(calculateMacMemory(parsed, 4_096), {
    totalBytes: 4_096,
    usedBytes: 0,
    availableBytes: 4_096,
    usagePercent: 0,
  });
});

test("parses decimal macOS swap counters and optional encryption suffix", () => {
  const result = parseMacSwapUsage(
    "total = 2048.00M used = 512.25M free = 1535.75M (encrypted)",
  );

  assert.equal(result.totalBytes, 2_147_483_648);
  assert.equal(result.usedBytes, 537_133_056);
  assert.equal(result.availableBytes, 1_610_350_592);
  assert.ok(Math.abs(result.usagePercent - 25.01220703125) < 0.000_001);
});

test("parses sw_vers labels without depending on field order", () => {
  assert.deepEqual(
    parseSwVers(`
BuildVersion:    24G90
ProductVersion:  15.6
ProductName:     macOS
`),
    {
      productName: "macOS",
      productVersion: "15.6",
      buildVersion: "24G90",
    },
  );
});

test("calculates df-style system-volume usage from statfs counters", () => {
  const result = calculateDiskCapacity({
    bsize: 4_096n,
    blocks: 1_000n,
    bfree: 400n,
    bavail: 300n,
  });

  assert.equal(result.totalBytes, 4_096_000);
  assert.equal(result.usedBytes, 2_457_600);
  assert.equal(result.availableBytes, 1_228_800);
  assert.ok(Math.abs(result.usagePercent - 66.6666) < 0.000_1);
});

test("clamps negative statfs bavail and rejects unsafe byte totals", () => {
  assert.deepEqual(
    calculateDiskCapacity({
      bsize: 4_096n,
      blocks: 1_000n,
      bfree: 400n,
      bavail: -10n,
    }),
    {
      totalBytes: 4_096_000,
      usedBytes: 2_457_600,
      availableBytes: 0,
      usagePercent: 100,
    },
  );
  assert.throws(
    () =>
      calculateDiskCapacity({
        bsize: 2n,
        blocks: BigInt(Number.MAX_SAFE_INTEGER),
        bfree: 0n,
        bavail: 0n,
      }),
    /JSON-safe integer/,
  );
});

test("collects a schema-valid strict-JSON snapshot on the current machine", async () => {
  const snapshot = await collectMachineSnapshot({
    cpuSampleMs: 100,
    signal: new AbortController().signal,
  });

  assert.doesNotThrow(() => machineSnapshotSchema.parse(snapshot));
  assertStrictJson(snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("propagates an already-aborted snapshot request", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    collectMachineSnapshot({ cpuSampleMs: 100, signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("rejects out-of-contract CPU sample windows", async () => {
  await assert.rejects(
    collectMachineSnapshot({
      cpuSampleMs: 99,
      signal: new AbortController().signal,
    }),
    /cpuSampleMs/,
  );
});

test("omits extra volumes when none are configured", async () => {
  const snapshot = await collectMachineSnapshot({
    cpuSampleMs: 100,
    signal: new AbortController().signal,
  });

  assert.equal("extraDisks" in snapshot, false);
});

test("measures a configured extra volume like the system volume", async () => {
  const snapshot = await collectMachineSnapshot({
    cpuSampleMs: 100,
    extraDiskPaths: ["/"],
    signal: new AbortController().signal,
  });

  assert.doesNotThrow(() => machineSnapshotSchema.parse(snapshot));
  assertStrictJson(snapshot);
  assert.equal(snapshot.extraDisks?.length, 1);
  assert.equal(snapshot.extraDisks?.[0]?.path, "/");
  assert.ok(snapshot.extraDisks?.[0]?.capacity);
  assert.ok(snapshot.extraDisks[0].capacity.totalBytes > 0);
});

test("marks missing, unmounted, and relative extra paths unavailable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "host-monitor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const missing = join(directory, "missing-volume");
  const issues: Parameters<typeof collectExtraDisks>[3] = [];

  const disks = await collectExtraDisks(
    [missing, directory, "relative/volume"],
    "linux",
    new AbortController().signal,
    issues,
  );

  assert.deepEqual(disks, [
    { path: missing, capacity: null },
    { path: directory, capacity: null },
    { path: "relative/volume", capacity: null },
  ]);
  assert.equal(issues.length, 3);
  assert.ok(issues.every((issue) => issue.metric === "disk"));
  assert.match(issues[0]?.message ?? "", /missing-volume could not be measured/u);
});

test("keeps sampling when one extra volume is missing", async () => {
  const snapshot = await collectMachineSnapshot({
    cpuSampleMs: 100,
    extraDiskPaths: ["/", "/definitely/not/mounted/host-monitor"],
    signal: new AbortController().signal,
  });

  assert.doesNotThrow(() => machineSnapshotSchema.parse(snapshot));
  assert.ok(snapshot.extraDisks?.[0]?.capacity);
  assert.deepEqual(snapshot.extraDisks?.[1], {
    path: "/definitely/not/mounted/host-monitor",
    capacity: null,
  });
});
