import assert from "node:assert/strict";
import test from "node:test";
import {
  blockedProcessReason,
  filterProcessRows,
  processActionPresentation,
  processOwnerLabel,
  sortProcessRows,
  summarizeProcessRows,
  type ProcessPresentationRow,
} from "../lib/process-presentation.ts";

function processRow(
  overrides: Partial<ProcessPresentationRow> & Pick<ProcessPresentationRow, "pid" | "name">,
): ProcessPresentationRow {
  return {
    allowedTerminationModes: ["graceful", "force"],
    blockedReason: null,
    cpuPercent: 1,
    memoryPercent: 1,
    ownerCategory: "same-user",
    rssBytes: 1_024,
    ...overrides,
  };
}

test("sorts processes deterministically without mutating the RPC rows", () => {
  const rows = [
    processRow({ cpuPercent: 20, memoryPercent: 2, name: "Beta", pid: 20 }),
    processRow({ cpuPercent: 80, memoryPercent: 1, name: "alpha", pid: 30 }),
    processRow({ cpuPercent: 80, memoryPercent: 4, name: "Alpha", pid: 10 }),
  ];

  assert.deepEqual(sortProcessRows(rows, "cpu").map((row) => row.pid), [10, 30, 20]);
  assert.deepEqual(sortProcessRows(rows, "memory").map((row) => row.pid), [10, 20, 30]);
  assert.deepEqual(sortProcessRows(rows, "name").map((row) => row.pid), [10, 30, 20]);
  assert.deepEqual(rows.map((row) => row.pid), [20, 30, 10]);
});

test("filters processes by safe name or PID fields", () => {
  const rows = [
    processRow({ name: "BB Agent", pid: 120 }),
    processRow({ name: "database", pid: 451 }),
    processRow({ name: "web", pid: 9120 }),
  ];

  assert.deepEqual(filterProcessRows(rows, " agent ").map((row) => row.pid), [120]);
  assert.deepEqual(filterProcessRows(rows, "12").map((row) => row.pid), [120, 9120]);
  assert.deepEqual(filterProcessRows(rows, "DATABASE").map((row) => row.pid), [451]);
  assert.deepEqual(filterProcessRows(rows, "missing"), []);
  assert.notEqual(filterProcessRows(rows, ""), rows);
});

test("summarizes top resource consumers and protected processes", () => {
  const topCpu = processRow({ cpuPercent: 75, memoryPercent: 2, name: "cpu", pid: 1 });
  const topMemory = processRow({ cpuPercent: 10, memoryPercent: 40, name: "memory", pid: 2 });
  const protectedRow = processRow({
    allowedTerminationModes: [],
    blockedReason: "system-process",
    cpuPercent: 5,
    memoryPercent: 3,
    name: "system",
    pid: 3,
  });

  assert.deepEqual(summarizeProcessRows([topMemory, protectedRow, topCpu]), {
    protectedCount: 1,
    topCpu,
    topMemory,
  });
  assert.deepEqual(summarizeProcessRows([]), {
    protectedCount: 0,
    topCpu: null,
    topMemory: null,
  });
});

test("prefers a graceful end and only labels force-only platforms honestly", () => {
  assert.deepEqual(
    processActionPresentation(processRow({ name: "worker", pid: 1 })),
    { disabled: false, label: "End process", mode: "graceful", reason: null },
  );
  assert.deepEqual(
    processActionPresentation(
      processRow({ allowedTerminationModes: ["force"], name: "worker", pid: 1 }),
    ),
    { disabled: false, label: "Force stop", mode: "force", reason: null },
  );
});

test("keeps blocked processes non-actionable with an accessible reason", () => {
  const action = processActionPresentation(
    processRow({
      allowedTerminationModes: [],
      blockedReason: "monitor-ancestor",
      name: "bb",
      pid: 10,
    }),
  );

  assert.equal(action.disabled, true);
  assert.equal(action.label, "Protected");
  assert.equal(action.mode, null);
  assert.match(action.reason ?? "", /depends on this process/u);
  assert.match(blockedProcessReason("mode-unsupported") ?? "", /unavailable/u);
  assert.match(blockedProcessReason("ancestry-unavailable") ?? "", /ancestry/u);
});

test("shows only safe ownership categories", () => {
  assert.equal(processOwnerLabel("same-user"), "You");
  assert.equal(processOwnerLabel("different-user"), "Other user");
  assert.equal(processOwnerLabel("unknown"), "Unknown");
});
