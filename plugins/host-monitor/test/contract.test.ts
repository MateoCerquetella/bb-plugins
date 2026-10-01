import assert from "node:assert/strict";
import test from "node:test";
import {
  hostContract,
  machineSnapshotSchema,
  networkSnapshotSchema,
  processListResultSchema,
  processRowSchema,
} from "../contract.ts";

test("network snapshot accepts only a canonical primary IP or null", () => {
  const throughput = {
    receiveBytesPerSecond: 1_024,
    sendBytesPerSecond: 512,
  } as const;
  assert.deepEqual(
    networkSnapshotSchema.parse({
      primaryIpAddress: "192.0.2.42",
      ...throughput,
    }),
    { primaryIpAddress: "192.0.2.42", ...throughput },
  );
  assert.deepEqual(
    networkSnapshotSchema.parse({
      primaryIpAddress: "2001:db8::42",
      ...throughput,
    }),
    { primaryIpAddress: "2001:db8::42", ...throughput },
  );
  assert.deepEqual(
    networkSnapshotSchema.parse({
      primaryIpAddress: null,
      receiveBytesPerSecond: null,
      sendBytesPerSecond: null,
    }),
    {
      primaryIpAddress: null,
      receiveBytesPerSecond: null,
      sendBytesPerSecond: null,
    },
  );
});

test("network snapshot rejects malformed addresses and extra interface data", () => {
  assert.throws(() =>
    networkSnapshotSchema.parse({
      primaryIpAddress: "999.1.2.3",
      receiveBytesPerSecond: null,
      sendBytesPerSecond: null,
    }),
  );
  assert.throws(() =>
    networkSnapshotSchema.parse({
      primaryIpAddress: "2001:db8::42%ethernet0",
      receiveBytesPerSecond: null,
      sendBytesPerSecond: null,
    }),
  );
  assert.throws(() =>
    networkSnapshotSchema.parse({
      primaryIpAddress: "192.0.2.42",
      receiveBytesPerSecond: 1,
      sendBytesPerSecond: 1,
      mac: "00:00:00:00:00:00",
    }),
  );
  assert.throws(() =>
    networkSnapshotSchema.parse({
      primaryIpAddress: "192.0.2.42",
      receiveBytesPerSecond: 1,
      sendBytesPerSecond: 1,
      interface: "ethernet0",
    }),
  );
  assert.throws(() =>
    networkSnapshotSchema.parse({
      primaryIpAddress: null,
      receiveBytesPerSecond: -1,
      sendBytesPerSecond: 0,
    }),
  );
  assert.throws(() =>
    networkSnapshotSchema.parse({
      primaryIpAddress: null,
      receiveBytesPerSecond: Number.MAX_SAFE_INTEGER + 1,
      sendBytesPerSecond: 0,
    }),
  );
  assert.throws(() =>
    networkSnapshotSchema.parse({
      primaryIpAddress: null,
      receiveBytesPerSecond: 0,
      sendBytesPerSecond: null,
    }),
  );
});

test("process rows expose only the bounded privacy-safe projection", () => {
  const row = {
    pid: 42,
    name: "worker",
    identity: "i".repeat(43),
    cpuPercent: 12,
    rssBytes: 1_024,
    memoryPercent: 1,
    startedAtMs: 1_000,
    ownerCategory: "same-user",
    allowedTerminationModes: ["graceful", "force"],
    blockedReason: null,
  } as const;
  assert.deepEqual(processRowSchema.parse(row), row);
  for (const secretField of ["argv", "path", "cwd", "environment", "username", "uid"]) {
    assert.throws(() =>
      processRowSchema.parse({ ...row, [secretField]: "must-not-cross-RPC" }),
    );
  }
});

test("process row protection fields cannot contradict each other", () => {
  const base = {
    pid: 42,
    name: "worker",
    identity: "i".repeat(43),
    cpuPercent: 12,
    rssBytes: 1_024,
    memoryPercent: 1,
    startedAtMs: 1_000,
    ownerCategory: "same-user",
  } as const;
  assert.throws(() =>
    processRowSchema.parse({
      ...base,
      allowedTerminationModes: [],
      blockedReason: null,
    }),
  );
  assert.deepEqual(
    processRowSchema.parse({
      ...base,
      identity: null,
      allowedTerminationModes: [],
      blockedReason: "elevated-session",
    }),
    {
      ...base,
      identity: null,
      allowedTerminationModes: [],
      blockedReason: "elevated-session",
    },
  );
  assert.throws(() =>
    processRowSchema.parse({
      ...base,
      identity: null,
      allowedTerminationModes: ["force"],
      blockedReason: null,
    }),
  );
});

test("process list result is strict and bounded", () => {
  assert.throws(() =>
    processListResultSchema.parse({
      outcome: "ok",
      host: {
        id: "host-alpha",
        name: "Alpha",
        status: "connected",
        platform: "linux",
        address: "192.0.2.1",
      },
      sampledAtMs: 1,
      elevated: false,
      totalCount: 0,
      truncated: false,
      processes: [],
    }),
  );
});

test("extra volume fields stay optional for existing hosts and servers", () => {
  const snapshotInput = hostContract.snapshot.input;
  assert.deepEqual(snapshotInput.parse({ cpuSampleMs: 300 }), {
    cpuSampleMs: 300,
  });
  assert.deepEqual(
    snapshotInput.parse({ cpuSampleMs: 300, extraDiskPaths: ["/srv"] }),
    { cpuSampleMs: 300, extraDiskPaths: ["/srv"] },
  );
  assert.throws(() =>
    snapshotInput.parse({
      cpuSampleMs: 300,
      extraDiskPaths: Array.from({ length: 9 }, (_, index) => `/v${index}`),
    }),
  );

  const extraDisks = machineSnapshotSchema.shape.extraDisks;
  assert.equal(extraDisks.parse(undefined), undefined);
  assert.deepEqual(
    extraDisks.parse([{ path: "/mnt/missing", capacity: null }]),
    [{ path: "/mnt/missing", capacity: null }],
  );
});
