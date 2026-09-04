import { execFile } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import {
  readdir,
  readFile,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type {
  ProcessBlockedReason,
  ProcessOwnerCategory,
  ProcessRow,
  ProcessSortBy,
  ProcessTerminationMode,
} from "../contract.js";

const MAX_PROCESS_COUNT = 4_096;
const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 4_000;
const WINDOWS_OWNER_SAMPLE_TIMEOUT_MS = 10_000;
const CPU_SAMPLE_MS = 160;
const GRACEFUL_RECHECK_MS = 3_000;
const PROCESS_NAME_MAX_LENGTH = 120;
const identitySecret = randomBytes(32);

export function resolveWindowsPowerShellPath(
  systemRoot: string | undefined,
): string {
  const root =
    typeof systemRoot === "string" &&
    path.win32.isAbsolute(systemRoot) &&
    !/\p{C}/u.test(systemRoot)
      ? path.win32.normalize(systemRoot)
      : "C:\\Windows";
  return path.win32.join(
    root,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

const WINDOWS_POWERSHELL_PATH = resolveWindowsPowerShellPath(
  process.env.SystemRoot,
);

type SupportedProcessPlatform = "linux" | "darwin" | "win32";

interface RawProcess {
  readonly pid: number;
  readonly parentPid: number;
  readonly name: string;
  readonly lifetimeKey: string | null;
  readonly cpuPercent: number;
  readonly rssBytes: number;
  readonly memoryPercent: number;
  readonly startedAtMs: number | null;
  readonly ownerCategory: ProcessOwnerCategory;
}

interface RawProcessInventory {
  readonly sampledAtMs: number;
  readonly platform: SupportedProcessPlatform;
  readonly elevated: boolean;
  readonly processes: readonly RawProcess[];
  readonly monitorAncestorPids: ReadonlySet<number>;
  readonly ancestryVerified: boolean;
}

interface LinuxProcessSample {
  readonly pid: number;
  readonly parentPid: number;
  readonly name: string;
  readonly startTicks: bigint;
  readonly cpuTicks: bigint;
  readonly rssBytes: number;
  readonly ownerCategory: ProcessOwnerCategory;
}

interface WindowsProcessSample {
  readonly pid: number;
  readonly parentPid: number | null;
  readonly name: string;
  readonly startedAtMs: number | null;
  readonly cpuTotalMs: number;
  readonly rssBytes: number;
  readonly ownerCategory: ProcessOwnerCategory;
}

export interface ProcessListSnapshot {
  readonly sampledAtMs: number;
  readonly platform: SupportedProcessPlatform;
  readonly elevated: boolean;
  readonly totalCount: number;
  readonly truncated: boolean;
  readonly processes: ProcessRow[];
}

export type InspectTerminationResult =
  | {
      readonly outcome: "ready";
      readonly process: {
        readonly pid: number;
        readonly name: string;
        readonly identity: string;
        readonly mode: ProcessTerminationMode;
        readonly cpuPercent: number;
        readonly rssBytes: number;
        readonly memoryPercent: number;
        readonly startedAtMs: number | null;
      };
    }
  | {
      readonly outcome: "blocked";
      readonly reason: ProcessBlockedReason;
      readonly message: string;
    }
  | {
      readonly outcome: "not-found" | "identity-changed";
      readonly message: string;
    };

export type TerminateProcessResult =
  | {
      readonly outcome: "signal-sent";
      readonly message: string;
    }
  | {
      readonly outcome: "still-running";
      readonly message: string;
    }
  | Exclude<InspectTerminationResult, { readonly outcome: "ready" }>
  | {
      readonly outcome: "signal-failed";
      readonly message: string;
    };

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("The operation was aborted.", "AbortError");
  }
}

function safeInteger(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(value)));
}

function safePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function parseNonnegativeInteger(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseNonnegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function sanitizeProcessName(value: unknown, pid?: number): string {
  const fallback = pid === undefined ? "Unknown process" : `Process ${pid}`;
  if (typeof value !== "string") return fallback;
  const basename = path.basename(value.replaceAll("\\", "/"));
  const cleaned = Array.from(basename)
    .filter((character) => !/\p{C}/u.test(character))
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned.length === 0
    ? fallback
    : cleaned.slice(0, PROCESS_NAME_MAX_LENGTH);
}

export function createOpaqueProcessIdentity(
  secret: Uint8Array,
  platform: SupportedProcessPlatform,
  pid: number,
  lifetimeKey: string | null,
): string | null {
  if (lifetimeKey === null || lifetimeKey.length === 0) return null;
  return createHmac("sha256", secret)
    .update(platform)
    .update("\0")
    .update(String(pid))
    .update("\0")
    .update(lifetimeKey)
    .digest("base64url");
}

function opaqueIdentity(
  platform: SupportedProcessPlatform,
  pid: number,
  lifetimeKey: string | null,
): string | null {
  return createOpaqueProcessIdentity(
    identitySecret,
    platform,
    pid,
    lifetimeKey,
  );
}

export function posixTerminationSignal(
  mode: ProcessTerminationMode,
): "SIGTERM" | "SIGKILL" {
  return mode === "graceful" ? "SIGTERM" : "SIGKILL";
}

function currentUid(): number | null {
  try {
    return typeof process.getuid === "function" ? process.getuid() : null;
  } catch {
    return null;
  }
}

function ownerCategoryFromUid(
  processUid: number | null,
  workerUid: number | null,
): ProcessOwnerCategory {
  if (processUid === null || workerUid === null) return "unknown";
  return processUid === workerUid ? "same-user" : "different-user";
}

function runFixedCommand(
  file: string,
  args: readonly string[],
  signal: AbortSignal,
  {
    additionalEnv = {},
    timeoutMs = COMMAND_TIMEOUT_MS,
  }: {
    additionalEnv?: Readonly<Record<string, string>>;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        encoding: "utf8",
        env:
          process.platform === "win32"
            ? { ...process.env, ...additionalEnv }
            : {
                ...process.env,
                LANG: "C",
                LC_ALL: "C",
                ...additionalEnv,
              },
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
        signal,
        timeout: timeoutMs,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function mapBounded<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await map(values[index]!);
      if (result !== null) results.push(result);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}

export function parseLinuxProcStat(
  text: string,
): {
  pid: number;
  parentPid: number;
  name: string;
  cpuTicks: bigint;
  startTicks: bigint;
} | null {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open <= 0 || close <= open || text[close + 1] !== " ") return null;
  const pid = parseNonnegativeInteger(text.slice(0, open).trim());
  if (pid === null) return null;
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  // Fields start at proc(5) field 3. We need ppid(4), utime(14), stime(15),
  // and starttime(22).
  if (fields.length < 20) return null;
  const parentPid = parseNonnegativeInteger(fields[1]!);
  if (parentPid === null) return null;
  try {
    const userTicks = BigInt(fields[11]!);
    const systemTicks = BigInt(fields[12]!);
    const startTicks = BigInt(fields[19]!);
    if (userTicks < 0n || systemTicks < 0n || startTicks < 0n) return null;
    return {
      pid,
      parentPid,
      name: sanitizeProcessName(text.slice(open + 1, close), pid),
      cpuTicks: userTicks + systemTicks,
      startTicks,
    };
  } catch {
    return null;
  }
}

export function parseLinuxRssBytes(text: string): number {
  const match = /^VmRSS:\s+(\d+)\s+kB\s*$/imu.exec(text);
  if (match === null) return 0;
  const kibibytes = parseNonnegativeInteger(match[1]!);
  if (kibibytes === null || kibibytes > Number.MAX_SAFE_INTEGER / 1_024) {
    return 0;
  }
  return kibibytes * 1_024;
}

async function readLinuxProcess(
  pid: number,
  workerUid: number | null,
): Promise<LinuxProcessSample | null> {
  try {
    const directory = `/proc/${pid}`;
    const [statText, statusText, processStat] = await Promise.all([
      readFile(`${directory}/stat`, "utf8"),
      readFile(`${directory}/status`, "utf8"),
      stat(directory),
    ]);
    const parsed = parseLinuxProcStat(statText);
    if (parsed === null || parsed.pid !== pid) return null;
    return {
      ...parsed,
      rssBytes: parseLinuxRssBytes(statusText),
      ownerCategory: ownerCategoryFromUid(processStat.uid, workerUid),
    };
  } catch {
    return null;
  }
}

let linuxClockTicksPromise: Promise<number> | null = null;

async function linuxClockTicks(signal: AbortSignal): Promise<number> {
  if (linuxClockTicksPromise === null) {
    linuxClockTicksPromise = runFixedCommand(
      "/usr/bin/getconf",
      ["CLK_TCK"],
      signal,
    )
      .then((text) => {
        const value = Number(text.trim());
        return Number.isFinite(value) && value > 0 ? value : 100;
      })
      .catch(() => 100);
  }
  return linuxClockTicksPromise;
}

async function readLinuxBootId(): Promise<string | null> {
  try {
    const value = (await readFile("/proc/sys/kernel/random/boot_id", "utf8"))
      .trim()
      .toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      value,
    )
      ? value
      : null;
  } catch {
    return null;
  }
}

async function collectLinuxInventory(
  signal: AbortSignal,
): Promise<RawProcessInventory> {
  throwIfAborted(signal);
  const workerUid = currentUid();
  const [entries, bootId, ticksPerSecond] = await Promise.all([
    readdir("/proc", { withFileTypes: true }),
    readLinuxBootId(),
    linuxClockTicks(signal),
  ]);
  const pids = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/u.test(entry.name))
    .map((entry) => Number(entry.name))
    .filter((pid) => Number.isSafeInteger(pid) && pid >= 0)
    .sort((left, right) => left - right)
    .slice(0, MAX_PROCESS_COUNT);
  const before = await mapBounded(pids, 32, (pid) =>
    readLinuxProcess(pid, workerUid),
  );
  throwIfAborted(signal);
  const started = performance.now();
  await delay(CPU_SAMPLE_MS, undefined, { signal });
  const after = await mapBounded(
    before.map((sample) => sample.pid),
    32,
    (pid) => readLinuxProcess(pid, workerUid),
  );
  throwIfAborted(signal);
  const elapsedMs = Math.max(1, performance.now() - started);
  const firstByPid = new Map(before.map((sample) => [sample.pid, sample]));
  const cores = Math.max(1, os.cpus().length);
  const totalMemory = Math.max(1, os.totalmem());
  const bootedAtMs = Math.max(0, Date.now() - os.uptime() * 1_000);
  const processes: RawProcess[] = [];
  for (const current of after) {
    const first = firstByPid.get(current.pid);
    if (
      first === undefined ||
      first.startTicks !== current.startTicks ||
      current.cpuTicks < first.cpuTicks
    ) {
      continue;
    }
    const cpuSeconds =
      Number(current.cpuTicks - first.cpuTicks) / ticksPerSecond;
    const cpuPercent =
      (cpuSeconds / (elapsedMs / 1_000) / Math.max(1, cores)) * 100;
    const startedAtMs = safeInteger(
      bootedAtMs + (Number(current.startTicks) / ticksPerSecond) * 1_000,
    );
    processes.push({
      pid: current.pid,
      parentPid: current.parentPid,
      name: current.name,
      lifetimeKey:
        bootId === null ? null : `${bootId}:${current.startTicks.toString()}`,
      cpuPercent: safePercent(cpuPercent),
      rssBytes: safeInteger(current.rssBytes),
      memoryPercent: safePercent((current.rssBytes / totalMemory) * 100),
      startedAtMs,
      ownerCategory: current.ownerCategory,
    });
  }
  const ancestry = await resolveLinuxMonitorAncestry(process.pid);
  return {
    sampledAtMs: safeInteger(Date.now()),
    platform: "linux",
    elevated: workerUid === 0,
    processes,
    monitorAncestorPids: ancestry.ancestorPids,
    ancestryVerified: ancestry.verified,
  };
}

async function resolveLinuxMonitorAncestry(workerPid: number): Promise<{
  ancestorPids: ReadonlySet<number>;
  verified: boolean;
}> {
  const ancestorPids = new Set<number>();
  let current = workerPid;
  for (let depth = 0; depth < 64; depth += 1) {
    let parsed: ReturnType<typeof parseLinuxProcStat>;
    try {
      parsed = parseLinuxProcStat(
        await readFile(`/proc/${current}/stat`, "utf8"),
      );
    } catch {
      return { ancestorPids, verified: false };
    }
    if (parsed === null || parsed.pid !== current) {
      return { ancestorPids, verified: false };
    }
    const parentPid = parsed.parentPid;
    if (parentPid <= 0) return { ancestorPids, verified: true };
    if (ancestorPids.has(parentPid)) {
      return { ancestorPids, verified: false };
    }
    ancestorPids.add(parentPid);
    if (parentPid === 1) return { ancestorPids, verified: true };
    current = parentPid;
  }
  return { ancestorPids, verified: false };
}

export function parseMacProcessList(
  text: string,
  workerUid: number | null,
  logicalCores: number,
  totalMemoryBytes: number,
): RawProcess[] {
  const results: RawProcess[] = [];
  const rowPattern =
    /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\d+)\s+([\d.]+)\s+(.+)$/u;
  for (const line of text.split(/\r?\n/u).slice(0, MAX_PROCESS_COUNT)) {
    const match = rowPattern.exec(line);
    if (match === null) continue;
    const pid = parseNonnegativeInteger(match[1]!);
    const parentPid = parseNonnegativeInteger(match[2]!);
    const uid = parseNonnegativeInteger(match[3]!);
    const rssKiB = parseNonnegativeInteger(match[5]!);
    const processCpu = Number(match[6]!);
    const startedAtMs = Date.parse(match[4]!);
    if (
      pid === null ||
      parentPid === null ||
      rssKiB === null ||
      !Number.isFinite(processCpu)
    ) {
      continue;
    }
    const rssBytes = safeInteger(rssKiB * 1_024);
    const name = sanitizeProcessName(match[7]!, pid);
    results.push({
      pid,
      parentPid,
      name,
      lifetimeKey: Number.isFinite(startedAtMs)
        ? `${match[4]!}\0${uid ?? "unknown"}\0${parentPid}\0${name}`
        : null,
      cpuPercent: safePercent(processCpu / Math.max(1, logicalCores)),
      rssBytes,
      memoryPercent: safePercent(
        (rssBytes / Math.max(1, totalMemoryBytes)) * 100,
      ),
      startedAtMs: Number.isFinite(startedAtMs)
        ? safeInteger(startedAtMs)
        : null,
      ownerCategory: ownerCategoryFromUid(uid, workerUid),
    });
  }
  return results;
}

async function collectMacInventory(
  signal: AbortSignal,
): Promise<RawProcessInventory> {
  const workerUid = currentUid();
  const output = await runFixedCommand(
    "/bin/ps",
    ["-axo", "pid=,ppid=,uid=,lstart=,rss=,%cpu=,comm="],
    signal,
  );
  throwIfAborted(signal);
  const processes = parseMacProcessList(
    output,
    workerUid,
    os.cpus().length,
    os.totalmem(),
  );
  const ancestry = resolveMonitorAncestry(processes, process.pid);
  return {
    sampledAtMs: safeInteger(Date.now()),
    platform: "darwin",
    elevated: workerUid === 0,
    processes,
    monitorAncestorPids: ancestry.ancestorPids,
    ancestryVerified: ancestry.verified,
  };
}

export const WINDOWS_PROCESS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$currentSid = [string]$currentIdentity.User.Value
$principal = New-Object System.Security.Principal.WindowsPrincipal($currentIdentity)
$elevated = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
$includeOwnerProof = $env:BB_HOST_MONITOR_INCLUDE_OWNER_PROOF -eq '1'
$boundedProcesses = @(Get-CimInstance Win32_Process | Select-Object -First ${MAX_PROCESS_COUNT})
$items = @($boundedProcesses | ForEach-Object {
  $cimProcess = $_
  $startedAtMs = $null
  $cpuTotalMs = 0
  $rssBytes = 0
  try { $startedAtMs = [long]([DateTimeOffset]$cimProcess.CreationDate).ToUnixTimeMilliseconds() } catch {}
  try { $cpuTotalMs = ([double]$cimProcess.UserModeTime + [double]$cimProcess.KernelModeTime) / 10000 } catch {}
  try { $rssBytes = [long]$cimProcess.WorkingSetSize } catch {}
  $ownerCategory = 'unknown'
  if ($includeOwnerProof) {
    try {
      $owner = Invoke-CimMethod -InputObject $cimProcess -MethodName GetOwnerSid -ErrorAction Stop
      if ($owner.ReturnValue -eq 0 -and $owner.Sid) {
        if ([string]::Equals([string]$owner.Sid, $currentSid, [System.StringComparison]::OrdinalIgnoreCase)) {
          $ownerCategory = 'same-user'
        } else {
          $ownerCategory = 'different-user'
        }
      }
    } catch {}
  }
  [PSCustomObject]@{
    pid = [int]$cimProcess.ProcessId
    parentPid = [int]$cimProcess.ParentProcessId
    name = [string]$cimProcess.Name
    startedAtMs = $startedAtMs
    cpuTotalMs = $cpuTotalMs
    rssBytes = $rssBytes
    ownerCategory = $ownerCategory
  }
})
[PSCustomObject]@{ elevated = [bool]$elevated; processes = $items } | ConvertTo-Json -Compress -Depth 4
`;

export function windowsProcessInvocation(includeOwnerProof: boolean): {
  file: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
} {
  return {
    file: WINDOWS_POWERSHELL_PATH,
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      WINDOWS_PROCESS_SCRIPT,
    ],
    env: {
      BB_HOST_MONITOR_INCLUDE_OWNER_PROOF: includeOwnerProof ? "1" : "0",
    },
    timeoutMs: includeOwnerProof
      ? WINDOWS_OWNER_SAMPLE_TIMEOUT_MS
      : COMMAND_TIMEOUT_MS,
  };
}

export const WINDOWS_FORCE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$targetId = [int]$env:BB_HOST_MONITOR_PROCESS_PID
$expectedStartedAtMs = [long]$env:BB_HOST_MONITOR_PROCESS_STARTED_AT_MS
$target = Get-Process -Id $targetId -ErrorAction SilentlyContinue
if ($null -eq $target) { exit 44 }
$actualStartedAtMs = $null
try { $actualStartedAtMs = [long]([DateTimeOffset]$target.StartTime).ToUnixTimeMilliseconds() } catch { exit 45 }
if ($actualStartedAtMs -ne $expectedStartedAtMs) { exit 45 }
try { $target.Kill() } catch { exit 46 }
exit 0
`;

export function windowsForceInvocation(
  pid: number,
  startedAtMs: number,
): {
  file: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
} {
  if (!Number.isSafeInteger(pid) || pid < 0) {
    throw new RangeError("Windows process PID must be a nonnegative safe integer.");
  }
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) {
    throw new RangeError("Windows process start time must be a nonnegative safe integer.");
  }
  return {
    file: WINDOWS_POWERSHELL_PATH,
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      WINDOWS_FORCE_SCRIPT,
    ],
    env: {
      BB_HOST_MONITOR_PROCESS_PID: String(pid),
      BB_HOST_MONITOR_PROCESS_STARTED_AT_MS: String(startedAtMs),
    },
  };
}

function windowsRows(value: unknown): readonly unknown[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Windows process data is not an object.");
  }
  const processes = (value as { processes?: unknown }).processes;
  return Array.isArray(processes)
    ? processes
    : processes === null || processes === undefined
      ? []
      : [processes];
}

export function parseWindowsProcessList(text: string): {
  elevated: boolean;
  processes: WindowsProcessSample[];
} {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/u, "").trim()) as unknown;
  } catch {
    throw new Error("Windows process data is not valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Windows process data is not an object.");
  }
  const elevated = (value as { elevated?: unknown }).elevated;
  if (typeof elevated !== "boolean") {
    throw new Error("Windows process data has no elevation state.");
  }
  const processes: WindowsProcessSample[] = [];
  for (const raw of windowsRows(value).slice(0, MAX_PROCESS_COUNT)) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const pid = parseNonnegativeNumber(row.pid);
    const parentPid =
      row.parentPid === null ? null : parseNonnegativeNumber(row.parentPid);
    const cpuTotalMs = parseNonnegativeNumber(row.cpuTotalMs);
    const rssBytes = parseNonnegativeNumber(row.rssBytes);
    const startedAtMs =
      row.startedAtMs === null ? null : parseNonnegativeNumber(row.startedAtMs);
    const ownerCategory = row.ownerCategory;
    if (
      pid === null ||
      cpuTotalMs === null ||
      rssBytes === null ||
      (startedAtMs === null && row.startedAtMs !== null) ||
      (ownerCategory !== "same-user" &&
        ownerCategory !== "different-user" &&
        ownerCategory !== "unknown")
    ) {
      continue;
    }
    processes.push({
      pid: safeInteger(pid),
      parentPid: parentPid === null ? null : safeInteger(parentPid),
      name: sanitizeProcessName(row.name, safeInteger(pid)),
      startedAtMs: startedAtMs === null ? null : safeInteger(startedAtMs),
      cpuTotalMs,
      rssBytes: safeInteger(rssBytes),
      ownerCategory,
    });
  }
  return { elevated, processes };
}

async function collectWindowsSample(
  signal: AbortSignal,
  includeOwnerProof: boolean,
): Promise<{ elevated: boolean; processes: WindowsProcessSample[] }> {
  const invocation = windowsProcessInvocation(includeOwnerProof);
  const output = await runFixedCommand(
    invocation.file,
    invocation.args,
    signal,
    {
      additionalEnv: invocation.env,
      timeoutMs: invocation.timeoutMs,
    },
  );
  return parseWindowsProcessList(output);
}

async function collectWindowsInventory(
  signal: AbortSignal,
): Promise<RawProcessInventory> {
  const before = await collectWindowsSample(signal, false);
  const started = performance.now();
  await delay(CPU_SAMPLE_MS, undefined, { signal });
  const after = await collectWindowsSample(signal, true);
  throwIfAborted(signal);
  const elapsedMs = Math.max(1, performance.now() - started);
  const firstByPid = new Map(before.processes.map((row) => [row.pid, row]));
  const cores = Math.max(1, os.cpus().length);
  const totalMemory = Math.max(1, os.totalmem());
  const processes: RawProcess[] = [];
  for (const current of after.processes) {
    const first = firstByPid.get(current.pid);
    if (
      first === undefined ||
      first.startedAtMs !== current.startedAtMs ||
      current.cpuTotalMs < first.cpuTotalMs
    ) {
      continue;
    }
    processes.push({
      pid: current.pid,
      parentPid: current.parentPid ?? 0,
      name: current.name,
      lifetimeKey:
        current.startedAtMs === null
          ? null
          : `${current.startedAtMs}\0${current.ownerCategory}\0${current.parentPid ?? "unknown"}\0${current.name}`,
      cpuPercent: safePercent(
        ((current.cpuTotalMs - first.cpuTotalMs) / elapsedMs / cores) * 100,
      ),
      rssBytes: current.rssBytes,
      memoryPercent: safePercent((current.rssBytes / totalMemory) * 100),
      startedAtMs: current.startedAtMs,
      ownerCategory: current.ownerCategory,
    });
  }
  const ancestry = resolveMonitorAncestry(
    after.processes.flatMap((row) =>
      row.parentPid === null
        ? []
        : [{ pid: row.pid, parentPid: row.parentPid }],
    ),
    process.pid,
  );
  return {
    sampledAtMs: safeInteger(Date.now()),
    platform: "win32",
    elevated: after.elevated,
    processes,
    monitorAncestorPids: ancestry.ancestorPids,
    ancestryVerified: ancestry.verified,
  };
}

async function collectRawInventory(
  signal: AbortSignal,
): Promise<RawProcessInventory> {
  if (process.platform === "linux") return collectLinuxInventory(signal);
  if (process.platform === "darwin") return collectMacInventory(signal);
  if (process.platform === "win32") return collectWindowsInventory(signal);
  throw new Error("Process inspection is unsupported on this operating system.");
}

export function resolveMonitorAncestry(
  processes: readonly { pid: number; parentPid: number }[],
  workerPid: number,
): { ancestorPids: ReadonlySet<number>; verified: boolean } {
  const parents = new Map(processes.map((row) => [row.pid, row.parentPid]));
  const ancestorPids = new Set<number>();
  if (!parents.has(workerPid)) return { ancestorPids, verified: false };
  let current = parents.get(workerPid);
  for (let depth = 0; depth < 64; depth += 1) {
    if (current === undefined) return { ancestorPids, verified: false };
    if (current <= 0) return { ancestorPids, verified: true };
    if (ancestorPids.has(current)) return { ancestorPids, verified: false };
    ancestorPids.add(current);
    if (current === 1) return { ancestorPids, verified: true };
    current = parents.get(current);
  }
  return { ancestorPids, verified: false };
}

export function monitorAncestorPids(
  processes: readonly { pid: number; parentPid: number }[],
  workerPid: number,
): ReadonlySet<number> {
  return resolveMonitorAncestry(processes, workerPid).ancestorPids;
}

export function processProtection({
  pid,
  identity,
  ownerCategory,
  elevated,
  platform,
  workerPid,
  ancestorPids,
  ancestryVerified,
}: {
  pid: number;
  identity: string | null;
  ownerCategory: ProcessOwnerCategory;
  elevated: boolean;
  platform: SupportedProcessPlatform;
  workerPid: number;
  ancestorPids: ReadonlySet<number>;
  ancestryVerified: boolean;
}): {
  allowedTerminationModes: ProcessTerminationMode[];
  blockedReason: ProcessBlockedReason | null;
} {
  let blockedReason: ProcessBlockedReason | null = null;
  if (elevated) blockedReason = "elevated-session";
  else if (pid === 0 || pid === 1 || (platform === "win32" && pid === 4)) {
    blockedReason = "system-process";
  } else if (pid === workerPid) blockedReason = "monitor-process";
  else if (!ancestryVerified) blockedReason = "ancestry-unavailable";
  else if (ancestorPids.has(pid)) blockedReason = "monitor-ancestor";
  else if (ownerCategory === "different-user") blockedReason = "different-owner";
  else if (ownerCategory === "unknown") blockedReason = "unknown-owner";
  else if (identity === null) blockedReason = "identity-unavailable";

  if (blockedReason !== null) {
    return { allowedTerminationModes: [], blockedReason };
  }
  return {
    allowedTerminationModes:
      platform === "win32" ? ["force"] : ["graceful", "force"],
    blockedReason: null,
  };
}

function processRows(inventory: RawProcessInventory): ProcessRow[] {
  return inventory.processes.map((raw) => {
    const identity = opaqueIdentity(
      inventory.platform,
      raw.pid,
      raw.lifetimeKey,
    );
    return {
      pid: raw.pid,
      name: raw.name,
      identity,
      cpuPercent: raw.cpuPercent,
      rssBytes: raw.rssBytes,
      memoryPercent: raw.memoryPercent,
      startedAtMs: raw.startedAtMs,
      ownerCategory: raw.ownerCategory,
      ...processProtection({
        pid: raw.pid,
        identity,
        ownerCategory: raw.ownerCategory,
        elevated: inventory.elevated,
        platform: inventory.platform,
        workerPid: process.pid,
        ancestorPids: inventory.monitorAncestorPids,
        ancestryVerified: inventory.ancestryVerified,
      }),
    };
  });
}

function sortProcessRows(
  processes: readonly ProcessRow[],
  sortBy: ProcessSortBy,
): ProcessRow[] {
  return [...processes].sort((left, right) => {
    if (sortBy === "name") {
      const byName = left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
      });
      return byName !== 0 ? byName : left.pid - right.pid;
    }
    const byMetric =
      sortBy === "cpu"
        ? right.cpuPercent - left.cpuPercent
        : right.rssBytes - left.rssBytes;
    return byMetric !== 0 ? byMetric : left.pid - right.pid;
  });
}

export async function collectProcessList({
  sortBy,
  limit,
  signal,
}: {
  sortBy: ProcessSortBy;
  limit: number;
  signal: AbortSignal;
}): Promise<ProcessListSnapshot> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new RangeError("Process list limit must be from 1 through 200.");
  }
  const inventory = await collectRawInventory(signal);
  const allRows = sortProcessRows(processRows(inventory), sortBy);
  const processes = allRows.slice(0, limit);
  return {
    sampledAtMs: inventory.sampledAtMs,
    platform: inventory.platform,
    elevated: inventory.elevated,
    totalCount: allRows.length,
    truncated: allRows.length > processes.length,
    processes,
  };
}

function blockedMessage(reason: ProcessBlockedReason): string {
  switch (reason) {
    case "elevated-session":
      return "Process control is disabled while Host Monitor is running with elevated privileges.";
    case "ancestry-unavailable":
      return "Host Monitor could not verify its worker ancestry, so process control is disabled.";
    case "system-process":
      return "This operating-system process is protected.";
    case "monitor-process":
      return "Host Monitor cannot stop its own worker.";
    case "monitor-ancestor":
      return "Host Monitor cannot stop a process that keeps its worker running.";
    case "different-owner":
      return "Host Monitor can only stop processes owned by the current account.";
    case "unknown-owner":
      return "The process owner could not be verified.";
    case "identity-unavailable":
      return "The process lifetime could not be verified.";
    case "mode-unsupported":
      return "That stop mode is not supported for this process.";
    case "unsupported-platform":
      return "Process control is unsupported on this operating system.";
  }
}

async function inspectFromInventory(
  input: {
    pid: number;
    identity: string;
    mode: ProcessTerminationMode;
  },
  signal: AbortSignal,
): Promise<
  InspectTerminationResult & {
    readonly platform?: SupportedProcessPlatform;
  }
> {
  const inventory = await collectRawInventory(signal);
  const row = processRows(inventory).find((candidate) => candidate.pid === input.pid);
  if (row === undefined) {
    return { outcome: "not-found", message: "The process is no longer running." };
  }
  if (row.identity === null) {
    return {
      outcome: "blocked",
      reason: "identity-unavailable",
      message: blockedMessage("identity-unavailable"),
    };
  }
  if (row.identity !== input.identity) {
    return {
      outcome: "identity-changed",
      message:
        "The process identity changed or could not be verified. Refresh before trying again.",
    };
  }
  if (row.blockedReason !== null) {
    return {
      outcome: "blocked",
      reason: row.blockedReason,
      message: blockedMessage(row.blockedReason),
    };
  }
  if (!row.allowedTerminationModes.includes(input.mode)) {
    return {
      outcome: "blocked",
      reason: "mode-unsupported",
      message: blockedMessage("mode-unsupported"),
    };
  }
  return {
    outcome: "ready",
    platform: inventory.platform,
    process: {
      pid: row.pid,
      name: row.name,
      identity: row.identity,
      mode: input.mode,
      cpuPercent: row.cpuPercent,
      rssBytes: row.rssBytes,
      memoryPercent: row.memoryPercent,
      startedAtMs: row.startedAtMs,
    },
  };
}

export async function inspectProcessTermination(
  input: {
    pid: number;
    identity: string;
    mode: ProcessTerminationMode;
  },
  signal: AbortSignal,
): Promise<InspectTerminationResult> {
  const result = await inspectFromInventory(input, signal);
  return result.outcome === "ready"
    ? { outcome: "ready", process: result.process }
    : result;
}

function signalFailureMessage(): string {
  return "The operating system did not accept the stop request.";
}

function commandExitCode(error: unknown): number | null {
  if (!(error instanceof Error) || !("code" in error)) return null;
  const value = (error as NodeJS.ErrnoException & { code?: unknown }).code;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

async function sendWindowsForce(
  pid: number,
  startedAtMs: number | null,
  signal: AbortSignal,
): Promise<"sent" | "not-found" | "identity-changed" | "failed"> {
  if (startedAtMs === null) return "identity-changed";
  try {
    const invocation = windowsForceInvocation(pid, startedAtMs);
    await runFixedCommand(
      invocation.file,
      invocation.args,
      signal,
      { additionalEnv: invocation.env },
    );
    return "sent";
  } catch (error) {
    throwIfAborted(signal);
    const exitCode = commandExitCode(error);
    if (exitCode === 44) return "not-found";
    if (exitCode === 45) return "identity-changed";
    if (exitCode === 46) return "failed";
    // A timeout, worker abort, or transport failure could happen after Kill()
    // dispatched. Preserve that ambiguity for the server's outcome-unknown.
    throw error;
  }
}

function missingProcessError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ("code" in error && (error as NodeJS.ErrnoException).code === "ESRCH")
  );
}

async function revalidatePosixIdentity(
  platform: "linux" | "darwin",
  pid: number,
  expectedIdentity: string,
  signal: AbortSignal,
): Promise<boolean> {
  throwIfAborted(signal);
  if (platform === "linux") {
    try {
      const [statText, bootId] = await Promise.all([
        readFile(`/proc/${pid}/stat`, "utf8"),
        readLinuxBootId(),
      ]);
      throwIfAborted(signal);
      const parsed = parseLinuxProcStat(statText);
      if (parsed === null || parsed.pid !== pid || bootId === null) return false;
      return (
        opaqueIdentity(
          "linux",
          pid,
          `${bootId}:${parsed.startTicks.toString()}`,
        ) === expectedIdentity
      );
    } catch {
      throwIfAborted(signal);
      return false;
    }
  }

  try {
    const output = await runFixedCommand(
      "/bin/ps",
      [
        "-p",
        String(pid),
        "-o",
        "pid=,ppid=,uid=,lstart=,rss=,%cpu=,comm=",
      ],
      signal,
    );
    const row = parseMacProcessList(
      output,
      currentUid(),
      os.cpus().length,
      os.totalmem(),
    ).find((candidate) => candidate.pid === pid);
    return (
      row !== undefined &&
      opaqueIdentity("darwin", pid, row.lifetimeKey) === expectedIdentity
    );
  } catch {
    throwIfAborted(signal);
    return false;
  }
}

export async function terminateProcess(
  input: {
    pid: number;
    identity: string;
    mode: ProcessTerminationMode;
  },
  signal: AbortSignal,
): Promise<TerminateProcessResult> {
  // This is the last read before the signal. It revalidates the opaque
  // lifetime identity, owner, worker ancestry, elevation state, and mode.
  const inspected = await inspectFromInventory(input, signal);
  if (inspected.outcome !== "ready") return inspected;
  throwIfAborted(signal);

  try {
    if (inspected.platform === "win32") {
      const outcome = await sendWindowsForce(
        input.pid,
        inspected.process.startedAtMs,
        signal,
      );
      if (outcome === "not-found") {
        return {
          outcome: "not-found",
          message: "The process is no longer running.",
        };
      }
      if (outcome === "identity-changed") {
        return {
          outcome: "identity-changed",
          message:
            "The process identity changed or could not be verified. Refresh before trying again.",
        };
      }
      if (outcome === "failed") {
        return { outcome: "signal-failed", message: signalFailureMessage() };
      }
    } else {
      const platform = inspected.platform === "darwin" ? "darwin" : "linux";
      if (
        !(await revalidatePosixIdentity(
          platform,
          input.pid,
          input.identity,
          signal,
        ))
      ) {
        return {
          outcome: "identity-changed",
          message:
            "The process identity changed or could not be verified. Refresh before trying again.",
        };
      }
      throwIfAborted(signal);
      process.kill(input.pid, posixTerminationSignal(input.mode));
    }
  } catch (error) {
    if (missingProcessError(error)) {
      return { outcome: "not-found", message: "The process is no longer running." };
    }
    throwIfAborted(signal);
    return { outcome: "signal-failed", message: signalFailureMessage() };
  }

  if (input.mode === "graceful" && inspected.platform !== "win32") {
    await delay(GRACEFUL_RECHECK_MS, undefined, { signal });
    const platform = inspected.platform === "darwin" ? "darwin" : "linux";
    if (
      await revalidatePosixIdentity(
        platform,
        input.pid,
        input.identity,
        signal,
      )
    ) {
      return {
        outcome: "still-running",
        message: "The process is still running after the graceful stop request.",
      };
    }
  }
  return {
    outcome: "signal-sent",
    message: "The stop signal was sent. Refresh the process list to confirm it exited.",
  };
}
