import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { processRowSchema } from "../contract.ts";
import hostEntry from "../host.ts";
import {
  WINDOWS_FORCE_SCRIPT,
  WINDOWS_PROCESS_SCRIPT,
  collectProcessList,
  createOpaqueProcessIdentity,
  monitorAncestorPids,
  parseLinuxProcStat,
  parseLinuxRssBytes,
  parseMacProcessList,
  parseWindowsProcessList,
  posixTerminationSignal,
  processProtection,
  resolveMonitorAncestry,
  resolveWindowsPowerShellPath,
  sanitizeProcessName,
  windowsForceInvocation,
  windowsProcessInvocation,
} from "../lib/processes.ts";

test("process names are reduced to safe basenames without Unicode controls", () => {
  assert.equal(
    sanitizeProcessName("/private/tmp/\u202Eevil\u2066\u0000worker", 7),
    "evilworker",
  );
  assert.equal(sanitizeProcessName("C:\\Program Files\\Demo\\agent.exe", 8), "agent.exe");
  assert.equal(sanitizeProcessName("\u202E\u2066", 9), "Process 9");
});

test("opaque process identities bind platform, PID, and lifetime without leaking it", () => {
  const secret = randomBytes(32);
  const identity = createOpaqueProcessIdentity(secret, "linux", 42, "boot:start");
  assert.match(identity ?? "", /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(identity?.includes("boot"), false);
  assert.equal(
    createOpaqueProcessIdentity(secret, "linux", 42, "boot:start"),
    identity,
  );
  assert.notEqual(
    createOpaqueProcessIdentity(secret, "linux", 42, "boot:next"),
    identity,
  );
  assert.notEqual(
    createOpaqueProcessIdentity(secret, "linux", 43, "boot:start"),
    identity,
  );
  assert.equal(createOpaqueProcessIdentity(secret, "linux", 42, null), null);
});

test("Linux proc parsers handle parenthesized names and bounded RSS", () => {
  const fields = Array.from({ length: 22 }, () => "0");
  fields[0] = "S";
  fields[1] = "1";
  fields[11] = "10";
  fields[12] = "5";
  fields[19] = "999";
  const parsed = parseLinuxProcStat(`42 (demo worker) ${fields.join(" ")}`);
  assert.deepEqual(parsed, {
    pid: 42,
    parentPid: 1,
    name: "demo worker",
    cpuTicks: 15n,
    startTicks: 999n,
  });
  assert.equal(parseLinuxRssBytes("Name: x\nVmRSS: 2048 kB\n"), 2_097_152);
  assert.equal(parseLinuxRssBytes("Name: x\n"), 0);
});

test("macOS parser never returns path or UID and normalizes machine CPU", () => {
  const rows = parseMacProcessList(
    "42 1 501 Wed Aug 26 12:34:56 2026 2048 200.0 /Applications/Demo/agent\n",
    501,
    4,
    8 * 1024 ** 3,
  );
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.name, "agent");
  assert.equal(row.cpuPercent, 50);
  assert.equal(row.ownerCategory, "same-user");
  assert.equal("uid" in row, false);
  assert.equal("path" in row, false);
  assert.match(row.lifetimeKey ?? "", /501/u);
});

test("Windows parser ignores injected credentials and executable details", () => {
  const parsed = parseWindowsProcessList(
    JSON.stringify({
      elevated: false,
      processes: [
        {
          pid: 52,
          parentPid: 10,
          name: "C:\\secret\\agent.exe",
          startedAtMs: 1_000,
          cpuTotalMs: 20,
          rssBytes: 4_096,
          ownerCategory: "same-user",
          username: "DOMAIN\\private-user",
          executablePath: "C:\\secret\\agent.exe",
          argv: ["--token", "secret"],
        },
      ],
    }),
  );
  assert.equal(parsed.processes[0]?.name, "agent.exe");
  assert.deepEqual(Object.keys(parsed.processes[0] ?? {}).sort(), [
    "cpuTotalMs",
    "name",
    "ownerCategory",
    "parentPid",
    "pid",
    "rssBytes",
    "startedAtMs",
  ]);

  const missingParent = parseWindowsProcessList(
    JSON.stringify({
      elevated: false,
      processes: {
        pid: 53,
        parentPid: null,
        name: "worker",
        startedAtMs: 1_001,
        cpuTotalMs: 21,
        rssBytes: 4_097,
        ownerCategory: "same-user",
      },
    }),
  );
  assert.equal(missingParent.processes[0]?.parentPid, null);
  assert.equal(
    resolveMonitorAncestry(
      missingParent.processes.flatMap((row) =>
        row.parentPid === null ? [] : [row as { pid: number; parentPid: number }],
      ),
      53,
    ).verified,
    false,
  );
});

test("Windows collection proves ownership without requiring elevated Get-Process", () => {
  assert.doesNotMatch(WINDOWS_PROCESS_SCRIPT, /IncludeUserName/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /Get-CimInstance Win32_Process/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /Select-Object -First 4096/u);
  assert.ok(
    WINDOWS_PROCESS_SCRIPT.indexOf("Select-Object -First 4096") <
      WINDOWS_PROCESS_SCRIPT.indexOf("MethodName GetOwnerSid"),
  );
  assert.doesNotMatch(WINDOWS_PROCESS_SCRIPT, /Get-Process -Id/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /UserModeTime/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /KernelModeTime/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /WorkingSetSize/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /CreationDate/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /MethodName GetOwnerSid/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /if \(\$includeOwnerProof\)/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /ownerCategory = 'unknown'/u);
  assert.match(WINDOWS_PROCESS_SCRIPT, /ownerCategory = 'same-user'/u);
  assert.doesNotMatch(
    WINDOWS_PROCESS_SCRIPT,
    /^\s*(?:username|userName|sid)\s*=/imu,
  );

  const metricsOnly = windowsProcessInvocation(false);
  const ownerBearing = windowsProcessInvocation(true);
  assert.deepEqual(metricsOnly.env, {
    BB_HOST_MONITOR_INCLUDE_OWNER_PROOF: "0",
  });
  assert.deepEqual(ownerBearing.env, {
    BB_HOST_MONITOR_INCLUDE_OWNER_PROOF: "1",
  });
  assert.equal(metricsOnly.timeoutMs, 4_000);
  assert.equal(ownerBearing.timeoutMs, 10_000);
  assert.deepEqual(metricsOnly.args, ownerBearing.args);
});

test("process protection blocks system, monitor, ancestor, owner, identity, and elevation", () => {
  const base = {
    identity: "i".repeat(43),
    ownerCategory: "same-user" as const,
    elevated: false,
    platform: "linux" as const,
    workerPid: 500,
    ancestorPids: new Set([100]),
    ancestryVerified: true,
  };
  assert.equal(processProtection({ ...base, pid: 1 }).blockedReason, "system-process");
  assert.equal(processProtection({ ...base, pid: 500 }).blockedReason, "monitor-process");
  assert.equal(processProtection({ ...base, pid: 100 }).blockedReason, "monitor-ancestor");
  assert.equal(
    processProtection({ ...base, pid: 200, ownerCategory: "different-user" }).blockedReason,
    "different-owner",
  );
  assert.equal(
    processProtection({ ...base, pid: 200, ownerCategory: "unknown" }).blockedReason,
    "unknown-owner",
  );
  assert.equal(processProtection({ ...base, pid: 200, identity: null }).blockedReason, "identity-unavailable");
  assert.equal(processProtection({ ...base, pid: 200, elevated: true }).blockedReason, "elevated-session");
  assert.deepEqual(processProtection({ ...base, pid: 200 }), {
    allowedTerminationModes: ["graceful", "force"],
    blockedReason: null,
  });
  assert.deepEqual(
    processProtection({ ...base, pid: 200, platform: "win32" }),
    { allowedTerminationModes: ["force"], blockedReason: null },
  );
});

test("monitor ancestry is bounded and cycle safe", () => {
  assert.deepEqual(
    [...monitorAncestorPids([
      { pid: 30, parentPid: 20 },
      { pid: 20, parentPid: 10 },
      { pid: 10, parentPid: 20 },
    ], 30)],
    [20, 10],
  );
  assert.deepEqual(
    resolveMonitorAncestry([{ pid: 30, parentPid: 20 }], 30),
    { ancestorPids: new Set([20]), verified: false },
  );
  assert.deepEqual(resolveMonitorAncestry([], 30), {
    ancestorPids: new Set(),
    verified: false,
  });
  assert.equal(
    processProtection({
      pid: 200,
      identity: "i".repeat(43),
      ownerCategory: "same-user",
      elevated: false,
      platform: "linux",
      workerPid: 500,
      ancestorPids: new Set(),
      ancestryVerified: false,
    }).blockedReason,
    "ancestry-unavailable",
  );
});

test("POSIX modes map only to SIGTERM and explicit SIGKILL", () => {
  assert.equal(posixTerminationSignal("graceful"), "SIGTERM");
  assert.equal(posixTerminationSignal("force"), "SIGKILL");
});

test("Windows force script rechecks StartTime and kills the validated object", () => {
  assert.match(WINDOWS_FORCE_SCRIPT, /StartTime/u);
  assert.match(WINDOWS_FORCE_SCRIPT, /actualStartedAtMs\s+-ne\s+\$expectedStartedAtMs/u);
  assert.match(WINDOWS_FORCE_SCRIPT, /\$target\.Kill\(\)/u);
  assert.doesNotMatch(WINDOWS_FORCE_SCRIPT, /taskkill/iu);
  assert.doesNotMatch(WINDOWS_FORCE_SCRIPT, /\$args/u);
  const invocation = windowsForceInvocation(42, 1_000);
  assert.equal(pathIsAbsoluteWindows(invocation.file), true);
  assert.deepEqual(invocation.args.slice(-2), ["-Command", WINDOWS_FORCE_SCRIPT]);
  assert.equal(invocation.args.includes("42"), false);
  assert.equal(invocation.args.includes("1000"), false);
  assert.deepEqual(invocation.env, {
    BB_HOST_MONITOR_PROCESS_PID: "42",
    BB_HOST_MONITOR_PROCESS_STARTED_AT_MS: "1000",
  });
  assert.equal(
    resolveWindowsPowerShellPath("D:\\Windows"),
    "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  );
  assert.equal(
    resolveWindowsPowerShellPath("relative\\Windows"),
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  );
});

function pathIsAbsoluteWindows(value: string): boolean {
  return /^[A-Za-z]:\\/u.test(value) || value.startsWith("\\\\");
}

test("live process collection is schema-valid and exposes only safe fields", async () => {
  const result = await collectProcessList({
    sortBy: "cpu",
    limit: 20,
    signal: AbortSignal.timeout(5_000),
  });
  assert.ok(result.totalCount >= result.processes.length);
  assert.equal(result.truncated, result.totalCount > result.processes.length);
  for (const row of result.processes) {
    assert.doesNotThrow(() => processRowSchema.parse(row));
    assert.deepEqual(Object.keys(row).sort(), [
      "allowedTerminationModes",
      "blockedReason",
      "cpuPercent",
      "identity",
      "memoryPercent",
      "name",
      "ownerCategory",
      "pid",
      "rssBytes",
      "startedAtMs",
    ]);
  }
});

test("host process RPC validates its bounded strict result", async (t) => {
  const harness = experimental_createHostEntryHarness(hostEntry);
  t.after(() => harness.experimental_dispose());
  const result = await harness.experimental_call("listProcesses", {
    sortBy: "memory",
    limit: 5,
  });
  assert.ok(result.processes.length <= 5);
  assert.equal(result.truncated, result.totalCount > result.processes.length);
});
