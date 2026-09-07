import { execFile } from "node:child_process";
import { readFile, statfs } from "node:fs/promises";
import { isIP } from "node:net";
import * as os from "node:os";
import { win32 as windowsPath } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type { MachineSnapshot } from "../contract.ts";
import {
  calculateNetworkThroughput,
  parseLinuxNetworkCounters,
  parseMacNetworkCounters,
  parseWindowsNetworkCounters,
  selectNetworkCounters,
  type NetworkCounterSnapshot,
  type NetworkThroughput,
} from "./network-throughput.ts";

const KIBIBYTE = 1_024;
const MEBIBYTE = KIBIBYTE ** 2;
const COMMAND_MAX_BUFFER_BYTES = 64 * KIBIBYTE;
const SYSTEM_FILE_MAX_BYTES = 64 * KIBIBYTE;
const SYSTEM_COMMAND_TIMEOUT_MS = 1_500;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const WINDOWS_NETWORK_COUNTER_SCRIPT = [
  "$ErrorActionPreference = 'Stop';",
  "@(Get-NetAdapter -IncludeHidden",
  "| Where-Object { $_.InterfaceType -ne 24 }",
  "| Get-NetAdapterStatistics",
  "| ForEach-Object { [PSCustomObject]@{",
  "id = [string]$_.Name;",
  "receivedBytes = [string]$_.ReceivedBytes;",
  "sentBytes = [string]$_.SentBytes",
  "} }) | ConvertTo-Json -Compress",
].join(" ");

type Capacity = MachineSnapshot["memory"];
type MetricIssue = MachineSnapshot["issues"][number];

export interface CpuInfoLike {
  readonly model: string;
  readonly times: {
    readonly user: number;
    readonly nice: number;
    readonly sys: number;
    readonly idle: number;
    readonly irq: number;
  };
}

export interface StatFsLike {
  readonly bsize: number | bigint;
  readonly blocks: number | bigint;
  readonly bfree: number | bigint;
  readonly bavail: number | bigint;
}

export interface ParsedVmStat {
  readonly pageSizeBytes: bigint;
  readonly pages: Readonly<Record<string, bigint>>;
}

export interface SwVersInfo {
  readonly productName: string | null;
  readonly productVersion: string | null;
  readonly buildVersion: string | null;
}

export interface NetworkAddressLike {
  readonly address: string;
  readonly family: string | number;
  readonly internal: boolean;
}

export type NetworkInterfacesLike = Readonly<
  Record<string, readonly NetworkAddressLike[] | undefined>
>;

interface CpuAggregate {
  readonly total: number;
  readonly idle: number;
}

interface NormalizedIpAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

function normalizeIpAddress(value: string): NormalizedIpAddress | null {
  const trimmed = value.trim();
  const zoneSeparator = trimmed.indexOf("%");
  const withoutZone =
    zoneSeparator === -1 ? trimmed : trimmed.slice(0, zoneSeparator);
  const family = isIP(withoutZone);
  if (family === 4) return { address: withoutZone, family };
  if (family !== 6) return null;

  try {
    const hostname = new URL(`http://[${withoutZone}]/`).hostname;
    const address = hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
    return isIP(address) === 6 ? { address, family } : null;
  } catch {
    return null;
  }
}

function isUsefulIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const first = octets[0]!;
  const second = octets[1]!;
  return !(
    first === 0 ||
    first === 127 ||
    first >= 224 ||
    (first === 169 && second === 254)
  );
}

function mappedIpv4Address(address: string): string | null {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/iu.exec(address);
  if (match === null) return null;
  const high = Number.parseInt(match[1]!, 16);
  const low = Number.parseInt(match[2]!, 16);
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join(".");
}

function isUsefulIpv6(address: string): boolean {
  const mappedIpv4 = mappedIpv4Address(address);
  if (mappedIpv4 !== null) return isUsefulIpv4(mappedIpv4);
  const firstHextet = Number.parseInt(address.split(":", 1)[0] || "0", 16);
  return !(
    address === "::" ||
    address === "::1" ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xff00) === 0xff00
  );
}

/** Restrict throughput to interfaces that own a useful, non-internal address. */
export function selectThroughputInterfaceNames(
  interfaces: NetworkInterfacesLike,
): ReadonlySet<string> {
  const selected = new Set<string>();
  for (const [name, addresses] of Object.entries(interfaces)) {
    const hasUsefulAddress = (addresses ?? []).some((entry) => {
      if (entry.internal) return false;
      const normalized = normalizeIpAddress(entry.address);
      if (normalized === null) return false;
      return normalized.family === 4
        ? isUsefulIpv4(normalized.address)
        : isUsefulIpv6(normalized.address);
    });
    if (hasUsefulAddress) selected.add(name);
  }
  return selected;
}

function readLoopbackInterfaceNames(): ReadonlySet<string> {
  try {
    const names = new Set<string>();
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
      if (addresses?.some((address) => address.internal)) names.add(name);
    }
    return names;
  } catch {
    return new Set();
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("Percentage must be finite.");
  }
  return Math.min(100, Math.max(0, value));
}

function requireSafeBytes(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function bigintToSafeNumber(value: bigint, label: string): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) {
    throw new RangeError(`${label} does not fit in a JSON-safe integer.`);
  }
  return Number(value);
}

function statValueToBigint(value: number | bigint, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }
  return BigInt(value);
}

function makeCapacity(
  totalBytes: number,
  usedBytes: number,
  availableBytes: number,
): Capacity {
  const total = requireSafeBytes(totalBytes, "Total bytes");
  const used = requireSafeBytes(usedBytes, "Used bytes");
  const available = requireSafeBytes(availableBytes, "Available bytes");

  if (used > total || available > total) {
    throw new RangeError("Used and available bytes cannot exceed total bytes.");
  }

  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: available,
    usagePercent: total === 0 ? 0 : clampPercent((used / total) * 100),
  };
}

export function calculateCapacity(
  totalBytes: number,
  availableBytes: number,
): Capacity {
  const total = requireSafeBytes(totalBytes, "Total bytes");
  const available = requireSafeBytes(availableBytes, "Available bytes");
  if (available > total) {
    throw new RangeError("Available bytes cannot exceed total bytes.");
  }
  return makeCapacity(total, total - available, available);
}

function aggregateCpuTimes(cpus: readonly CpuInfoLike[]): CpuAggregate {
  if (cpus.length === 0) {
    throw new Error("CPU counters are unavailable.");
  }

  let total = 0;
  let idle = 0;
  for (const cpu of cpus) {
    const times = [
      cpu.times.user,
      cpu.times.nice,
      cpu.times.sys,
      cpu.times.idle,
      cpu.times.irq,
    ];
    if (times.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("CPU counters contain an invalid value.");
    }

    const cpuTotal = times.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(cpuTotal)) {
      throw new Error("CPU counters exceed the safe integer range.");
    }
    total += cpuTotal;
    idle += cpu.times.idle;
  }

  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(idle)) {
    throw new Error("Aggregate CPU counters exceed the safe integer range.");
  }
  return { total, idle };
}

export function calculateCpuUsage(
  before: readonly CpuInfoLike[],
  after: readonly CpuInfoLike[],
): number {
  if (before.length !== after.length) {
    throw new Error("CPU topology changed during sampling.");
  }

  const first = aggregateCpuTimes(before);
  const second = aggregateCpuTimes(after);
  const totalDelta = second.total - first.total;
  const idleDelta = second.idle - first.idle;

  if (totalDelta <= 0 || idleDelta < 0 || idleDelta > totalDelta) {
    throw new Error("CPU counters regressed or did not advance.");
  }

  return clampPercent(((totalDelta - idleDelta) / totalDelta) * 100);
}

const PROC_MEMORY_KEYS = new Set([
  "MemTotal",
  "MemAvailable",
  "MemFree",
  "Buffers",
  "Cached",
  "SReclaimable",
  "Shmem",
  "SwapTotal",
  "SwapFree",
]);

export function parseProcMeminfo(text: string): Readonly<Record<string, bigint>> {
  const values: Record<string, bigint> = {};

  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_()]*)\s*:\s*(\d+)(?:\s+([A-Za-z]+))?\s*$/.exec(
      line,
    );
    if (!match || !PROC_MEMORY_KEYS.has(match[1]!)) continue;

    const unit = match[3] ?? null;
    if (unit !== null && unit.toLowerCase() !== "kb") {
      throw new Error(`Unsupported /proc/meminfo unit for ${match[1]}.`);
    }
    if (values[match[1]!] !== undefined) {
      throw new Error(`/proc/meminfo repeats ${match[1]}.`);
    }
    const multiplier = unit === null ? 1n : BigInt(KIBIBYTE);
    values[match[1]!] = BigInt(match[2]!) * multiplier;
  }

  return values;
}

function requiredProcValue(
  values: Readonly<Record<string, bigint>>,
  key: string,
): bigint {
  const value = values[key];
  if (value === undefined) {
    throw new Error(`/proc/meminfo is missing ${key}.`);
  }
  return value;
}

export function calculateLinuxMemory(
  values: Readonly<Record<string, bigint>>,
): { readonly capacity: Capacity; readonly estimatedAvailable: boolean } {
  const total = requiredProcValue(values, "MemTotal");
  let available = values.MemAvailable;
  let estimatedAvailable = false;

  if (available === undefined) {
    estimatedAvailable = true;
    available =
      requiredProcValue(values, "MemFree") +
      (values.Buffers ?? 0n) +
      (values.Cached ?? 0n) +
      (values.SReclaimable ?? 0n) -
      (values.Shmem ?? 0n);
    available = available < 0n ? 0n : available;
    available = available > total ? total : available;
  }

  if (total < 0n || available < 0n || available > total) {
    throw new Error("Linux memory counters are inconsistent.");
  }

  const totalBytes = bigintToSafeNumber(total, "Linux total memory");
  const availableBytes = bigintToSafeNumber(available, "Linux available memory");
  return {
    capacity: calculateCapacity(totalBytes, availableBytes),
    estimatedAvailable,
  };
}

export function calculateLinuxSwap(
  values: Readonly<Record<string, bigint>>,
): Capacity | null {
  const total = values.SwapTotal;
  const free = values.SwapFree;
  if (total === undefined && free === undefined) return null;
  if (total === undefined || free === undefined || free < 0n || free > total) {
    throw new Error("Linux swap counters are missing or inconsistent.");
  }

  return calculateCapacity(
    bigintToSafeNumber(total, "Linux total swap"),
    bigintToSafeNumber(free, "Linux free swap"),
  );
}

function unquoteOsReleaseValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
      return trimmed.slice(1, -1).replace(/\\(.)/g, "$1");
    }
  }
  return trimmed.replace(/\\(.)/g, "$1");
}

export function parseOsRelease(text: string): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:#|$)/.test(line)) continue;
    const match = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]!] = unquoteOsReleaseValue(match[2]!);
  }
  return values;
}

export function parseVmStat(text: string): ParsedVmStat {
  const pageSizeMatch = /page size of\s+(\d+)\s+bytes/i.exec(text);
  if (!pageSizeMatch) {
    throw new Error("vm_stat output does not include its page size.");
  }
  const pageSizeBytes = BigInt(pageSizeMatch[1]!);
  if (pageSizeBytes <= 0n) {
    throw new Error("vm_stat reported an invalid page size.");
  }

  const pages: Record<string, bigint> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([^:]+):\s*(\d+)\.\s*$/.exec(line);
    if (!match) continue;
    pages[match[1]!.trim().toLowerCase()] = BigInt(match[2]!);
  }

  if (pages["pages free"] === undefined || pages["pages inactive"] === undefined) {
    throw new Error("vm_stat output is missing required page counters.");
  }
  return { pageSizeBytes, pages };
}

export function calculateMacMemory(
  parsed: ParsedVmStat,
  totalBytes: number,
): Capacity {
  const total = requireSafeBytes(totalBytes, "macOS total memory");
  const freePages = parsed.pages["pages free"]!;
  const inactivePages = parsed.pages["pages inactive"]!;
  const speculativePages = parsed.pages["pages speculative"] ?? 0n;
  let available =
    (freePages + inactivePages + speculativePages) * parsed.pageSizeBytes;
  const totalBigint = BigInt(total);
  if (available < 0n) available = 0n;
  if (available > totalBigint) available = totalBigint;

  return calculateCapacity(
    total,
    bigintToSafeNumber(available, "macOS available memory"),
  );
}

function parseScaledByteAmount(valueText: string, unitText: string): number {
  const value = Number(valueText);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Byte amount is invalid.");
  }
  const multiplier =
    ({
      "": 1,
      B: 1,
      K: KIBIBYTE,
      M: MEBIBYTE,
      G: KIBIBYTE ** 3,
      T: KIBIBYTE ** 4,
      P: KIBIBYTE ** 5,
    } as const)[unitText.toUpperCase() as "" | "B" | "K" | "M" | "G" | "T" | "P"];
  if (multiplier === undefined) {
    throw new Error("Byte amount uses an unsupported unit.");
  }
  return requireSafeBytes(Math.round(value * multiplier), "Parsed byte amount");
}

function matchMacSwapAmount(text: string, label: string): number {
  const pattern = new RegExp(
    `${label}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*([KMGTP]?B?)(?=\\s|$|\\))`,
    "i",
  );
  const match = pattern.exec(text);
  if (!match) throw new Error(`vm.swapusage is missing ${label}.`);
  return parseScaledByteAmount(match[1]!, match[2]!);
}

export function parseMacSwapUsage(text: string): Capacity {
  const total = matchMacSwapAmount(text, "total");
  const used = matchMacSwapAmount(text, "used");
  const free = matchMacSwapAmount(text, "free");
  if (used > total || free > total) {
    throw new Error("vm.swapusage counters are inconsistent.");
  }
  return makeCapacity(total, used, free);
}

export function parseSwVers(text: string): SwVersInfo {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return {
    productName: values.ProductName || null,
    productVersion: values.ProductVersion || null,
    buildVersion: values.BuildVersion || null,
  };
}

export function calculateDiskCapacity(stats: StatFsLike): Capacity {
  const blockSize = statValueToBigint(stats.bsize, "Filesystem block size");
  const blocks = statValueToBigint(stats.blocks, "Filesystem block count");
  const freeBlocks = statValueToBigint(stats.bfree, "Filesystem free blocks");
  let availableBlocks = statValueToBigint(
    stats.bavail,
    "Filesystem available blocks",
  );

  if (blockSize <= 0n || blocks < 0n || freeBlocks < 0n || freeBlocks > blocks) {
    throw new Error("Filesystem counters are inconsistent.");
  }
  if (availableBlocks < 0n) availableBlocks = 0n;
  if (availableBlocks > freeBlocks) availableBlocks = freeBlocks;

  const total = blocks * blockSize;
  const free = freeBlocks * blockSize;
  const available = availableBlocks * blockSize;
  const used = total - free;
  const usable = used + available;
  const totalBytes = bigintToSafeNumber(total, "Filesystem total bytes");
  const usedBytes = bigintToSafeNumber(used, "Filesystem used bytes");
  const availableBytes = bigintToSafeNumber(
    available,
    "Filesystem available bytes",
  );

  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usagePercent:
      usable === 0n
        ? 0
        : clampPercent(Number((used * 1_000_000n) / usable) / 10_000),
  };
}

function sanitizeText(value: unknown, fallback: string, maxLength = 256): string {
  if (typeof value !== "string") return fallback;
  const withoutControls = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("");
  const sanitized = withoutControls
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return sanitized || fallback;
}

function pushIssue(
  issues: MetricIssue[],
  metric: MetricIssue["metric"],
  message: string,
): void {
  if (issues.some((issue) => issue.metric === metric && issue.message === message)) {
    return;
  }
  issues.push({ metric, message });
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("The metrics snapshot was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

function systemDiskPath(platform: NodeJS.Platform): string {
  if (platform !== "win32") return "/";

  const candidates = [
    process.env.SystemDrive,
    process.env.SystemRoot
      ? windowsPath.parse(process.env.SystemRoot).root
      : undefined,
    windowsPath.parse(process.execPath).root,
  ];
  for (const candidate of candidates) {
    const match = /^([A-Za-z]):(?:[\\/])?$/.exec(candidate?.trim() ?? "");
    if (match) return `${match[1]!.toUpperCase()}:\\`;
  }
  return "C:\\";
}

async function readBoundedText(path: string, signal: AbortSignal): Promise<string> {
  const text = await readFile(path, { encoding: "utf8", signal });
  if (Buffer.byteLength(text, "utf8") > SYSTEM_FILE_MAX_BYTES) {
    throw new Error(`${path} exceeds the metrics input limit.`);
  }
  return text;
}

async function runBoundedCommand(
  file: string,
  args: readonly string[],
  signal: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  return await new Promise<string>((resolve, reject) => {
    try {
      execFile(
        file,
        [...args],
        {
          encoding: "utf8",
          env: { ...process.env, LANG: "C", LC_ALL: "C" },
          maxBuffer: COMMAND_MAX_BUFFER_BYTES,
          shell: false,
          signal,
          timeout: SYSTEM_COMMAND_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout);
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

function nodeMemory(issues: MetricIssue[]): Capacity {
  try {
    const total = requireSafeBytes(Math.trunc(os.totalmem()), "Total memory");
    const reportedAvailable = requireSafeBytes(
      Math.trunc(os.freemem()),
      "Available memory",
    );
    if (reportedAvailable > total) {
      pushIssue(
        issues,
        "memory",
        "The operating system reported inconsistent memory counters; available memory was clamped.",
      );
    }
    return calculateCapacity(total, Math.min(total, reportedAvailable));
  } catch {
    pushIssue(issues, "memory", "Memory counters are unavailable on this machine.");
    return calculateCapacity(0, 0);
  }
}

function safeCpuMetadata(cpus: readonly CpuInfoLike[]): {
  model: string;
  logicalCores: number;
} {
  let fallbackParallelism = 1;
  try {
    fallbackParallelism = Math.max(1, Math.trunc(os.availableParallelism()));
  } catch {
    // The contract requires at least one logical core.
  }
  return {
    model: sanitizeText(cpus[0]?.model ?? "", ""),
    logicalCores: Math.max(1, cpus.length || fallbackParallelism),
  };
}

function readLoadAverage(
  platform: NodeJS.Platform,
  issues: MetricIssue[],
): [number, number, number] | null {
  if (platform === "win32") return null;
  try {
    const values = os.loadavg();
    if (
      values.length !== 3 ||
      values.some((value) => !Number.isFinite(value) || value < 0)
    ) {
      throw new Error("Invalid load average.");
    }
    return [values[0]!, values[1]!, values[2]!];
  } catch {
    pushIssue(issues, "cpu", "Load average is unavailable on this machine.");
    return null;
  }
}

interface TimedNetworkCounters {
  readonly counters: NetworkCounterSnapshot;
  readonly sampledAt: number;
}

function platformSupportsNetworkCounters(platform: NodeJS.Platform): boolean {
  return platform === "linux" || platform === "darwin" || platform === "win32";
}

async function readNetworkCounters(
  platform: NodeJS.Platform,
  loopbackInterfaceNames: ReadonlySet<string>,
  selectedInterfaceNames: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<TimedNetworkCounters> {
  const startedAt = performance.now();
  let counters: NetworkCounterSnapshot;
  if (platform === "linux") {
    counters = parseLinuxNetworkCounters(
      await readBoundedText("/proc/net/dev", signal),
      loopbackInterfaceNames,
    );
  } else if (platform === "darwin") {
    counters = parseMacNetworkCounters(
      await runBoundedCommand("/usr/sbin/netstat", ["-ibn"], signal),
      loopbackInterfaceNames,
    );
  } else if (platform === "win32") {
    counters = parseWindowsNetworkCounters(
      await runBoundedCommand(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WINDOWS_NETWORK_COUNTER_SCRIPT,
        ],
        signal,
      ),
      loopbackInterfaceNames,
    );
  } else {
    throw new Error("Network counters are unsupported on this platform.");
  }
  const completedAt = performance.now();
  const comparableSelectedNames =
    platform === "win32"
      ? new Set(
          [...selectedInterfaceNames].map((name) => name.toLowerCase()),
        )
      : selectedInterfaceNames;
  return {
    counters: selectNetworkCounters(counters, comparableSelectedNames),
    sampledAt: startedAt + (completedAt - startedAt) / 2,
  };
}

function unavailableNetworkThroughput(): {
  readonly receiveBytesPerSecond: null;
  readonly sendBytesPerSecond: null;
} {
  return { receiveBytesPerSecond: null, sendBytesPerSecond: null };
}

async function collectCpuAndNetwork(
  cpuSampleMs: number,
  platform: NodeJS.Platform,
  signal: AbortSignal,
  issues: MetricIssue[],
): Promise<{
  readonly cpu: MachineSnapshot["cpu"];
  readonly networkThroughput:
    | NetworkThroughput
    | ReturnType<typeof unavailableNetworkThroughput>;
}> {
  const loopbackInterfaceNames = readLoopbackInterfaceNames();
  let selectedInterfaceNames: ReadonlySet<string> = new Set();
  try {
    selectedInterfaceNames = selectThroughputInterfaceNames(
      os.networkInterfaces(),
    );
  } catch {
    // An empty selection fails closed after the sample window.
  }
  let firstNetworkSample: TimedNetworkCounters | null = null;
  if (platformSupportsNetworkCounters(platform)) {
    try {
      firstNetworkSample = await readNetworkCounters(
        platform,
        loopbackInterfaceNames,
        selectedInterfaceNames,
        signal,
      );
    } catch {
      throwIfAborted(signal);
      pushIssue(
        issues,
        "network",
        "Network throughput counters are unavailable on this machine.",
      );
    }
  } else {
    pushIssue(
      issues,
      "network",
      "Network throughput is unsupported on this operating system.",
    );
  }

  let before: readonly CpuInfoLike[] = [];
  let after: readonly CpuInfoLike[] = [];
  let usagePercent = 0;
  try {
    before = os.cpus();
  } catch {
    // The common fallback path below reports one CPU issue after the window.
  }
  await delay(cpuSampleMs, undefined, { signal });
  try {
    after = os.cpus();
    usagePercent = calculateCpuUsage(before, after);
  } catch {
    throwIfAborted(signal);
    pushIssue(
      issues,
      "cpu",
      "CPU utilization could not be sampled; the displayed utilization is a fallback.",
    );
    if (after.length === 0) {
      try {
        after = os.cpus();
      } catch {
        // Metadata falls back to the available-parallelism estimate below.
      }
    }
  }

  let networkThroughput:
    | NetworkThroughput
    | ReturnType<typeof unavailableNetworkThroughput> =
    unavailableNetworkThroughput();
  if (firstNetworkSample !== null) {
    try {
      const secondNetworkSample = await readNetworkCounters(
        platform,
        loopbackInterfaceNames,
        selectedInterfaceNames,
        signal,
      );
      const calculated = calculateNetworkThroughput(
        firstNetworkSample.counters,
        secondNetworkSample.counters,
        secondNetworkSample.sampledAt - firstNetworkSample.sampledAt,
      );
      networkThroughput = {
        receiveBytesPerSecond: calculated.receiveBytesPerSecond,
        sendBytesPerSecond: calculated.sendBytesPerSecond,
      };
      if (calculated.partial) {
        pushIssue(
          issues,
          "network",
          "Some network interfaces changed during sampling; throughput uses stable interfaces only.",
        );
      }
    } catch {
      throwIfAborted(signal);
      pushIssue(
        issues,
        "network",
        "Network throughput counters changed or became unavailable during sampling.",
      );
    }
  }

  const metadata = safeCpuMetadata(after.length > 0 ? after : before);
  return {
    cpu: {
      ...metadata,
      usagePercent,
      loadAverage: readLoadAverage(platform, issues),
    },
    networkThroughput,
  };
}

function buildSystem(
  platform: NodeJS.Platform,
  sampledAtMs: number,
  osNameOverride: string | null,
  issues: MetricIssue[],
): MachineSnapshot["system"] {
  let identityFallbackUsed = false;
  const safeIdentity = (read: () => string, fallback: string): string => {
    try {
      const value = sanitizeText(read(), fallback);
      if (value === fallback) identityFallbackUsed = true;
      return value;
    } catch {
      identityFallbackUsed = true;
      return fallback;
    }
  };

  const arch = safeIdentity(() => os.machine(), safeIdentity(() => os.arch(), "unknown"));
  let uptimeSeconds = 0;
  try {
    const uptime = os.uptime();
    if (!Number.isFinite(uptime) || uptime < 0) throw new Error("Invalid uptime.");
    uptimeSeconds = uptime;
  } catch {
    identityFallbackUsed = true;
  }

  const defaultOsName =
    platform === "darwin"
      ? "macOS"
      : platform === "win32"
        ? "Windows"
        : safeIdentity(() => os.type(), platform || "Unknown OS");

  const system: MachineSnapshot["system"] = {
    hostname: safeIdentity(() => os.hostname(), "Unknown host"),
    osName: sanitizeText(osNameOverride, defaultOsName),
    platform: sanitizeText(platform, "unknown"),
    arch,
    kernelRelease: safeIdentity(() => os.release(), "unknown"),
    kernelVersion: safeIdentity(() => os.version(), "unknown"),
    uptimeSeconds,
    bootedAtMs: Math.max(0, Math.round(sampledAtMs - uptimeSeconds * 1_000)),
  };
  if (identityFallbackUsed) {
    pushIssue(
      issues,
      "system",
      "Some system identity details are unavailable on this machine.",
    );
  }
  return system;
}

async function collectDisk(
  platform: NodeJS.Platform,
  signal: AbortSignal,
): Promise<MachineSnapshot["disk"]> {
  const path = systemDiskPath(platform);
  throwIfAborted(signal);
  const values = await statfs(path, { bigint: true });
  throwIfAborted(signal);
  return { path, ...calculateDiskCapacity(values) };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function assertStrictJson(value: unknown, path = "snapshot"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} is not finite.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertStrictJson(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) throw new TypeError(`${path}.${key} is undefined.`);
      assertStrictJson(entry, `${path}.${key}`);
    }
    return;
  }
  throw new TypeError(`${path} is not strict JSON.`);
}

export async function collectMachineSnapshot({
  cpuSampleMs,
  signal,
}: {
  cpuSampleMs: number;
  signal: AbortSignal;
}): Promise<MachineSnapshot> {
  if (!Number.isInteger(cpuSampleMs) || cpuSampleMs < 100 || cpuSampleMs > 1_000) {
    throw new RangeError("cpuSampleMs must be an integer from 100 through 1000.");
  }
  throwIfAborted(signal);

  const startedAt = performance.now();
  const issues: MetricIssue[] = [];
  let platform: NodeJS.Platform;
  try {
    platform = os.platform();
  } catch {
    platform = process.platform;
    pushIssue(issues, "system", "The operating-system platform required a fallback.");
  }

  // Network counters bracket the existing CPU delay, so both rates come from
  // one bounded sample window without a second wait. Command-backed reads run
  // outside the CPU counter pair so they do not inflate CPU utilization.
  const { cpu, networkThroughput } = await collectCpuAndNetwork(
    cpuSampleMs,
    platform,
    signal,
    issues,
  );
  throwIfAborted(signal);

  let memory = nodeMemory(issues);
  let swap: Capacity | null = null;
  let disk: MachineSnapshot["disk"] = null;
  let osNameOverride: string | null = null;

  if (platform === "linux") {
    const [meminfoResult, osReleaseResult, diskResult] = await Promise.allSettled([
      readBoundedText("/proc/meminfo", signal),
      readBoundedText("/etc/os-release", signal),
      collectDisk(platform, signal),
    ]);
    throwIfAborted(signal);

    const meminfoText = settledValue(meminfoResult);
    if (meminfoText === null) {
      pushIssue(
        issues,
        "memory",
        "Linux memory details are unavailable; Node's memory counters are shown instead.",
      );
      pushIssue(issues, "swap", "Linux swap details are unavailable.");
    } else {
      try {
        const values = parseProcMeminfo(meminfoText);
        const linuxMemory = calculateLinuxMemory(values);
        memory = linuxMemory.capacity;
        if (linuxMemory.estimatedAvailable) {
          pushIssue(
            issues,
            "memory",
            "MemAvailable is missing; available memory is estimated from reclaimable counters.",
          );
        }
        try {
          swap = calculateLinuxSwap(values);
          if (swap === null) {
            pushIssue(issues, "swap", "Linux swap counters are unavailable.");
          }
        } catch {
          pushIssue(issues, "swap", "Linux swap counters are inconsistent.");
        }
      } catch {
        pushIssue(
          issues,
          "memory",
          "Linux memory details are invalid; Node's memory counters are shown instead.",
        );
        pushIssue(issues, "swap", "Linux swap details could not be parsed.");
      }
    }

    const osReleaseText = settledValue(osReleaseResult);
    if (osReleaseText === null) {
      pushIssue(issues, "system", "The Linux distribution name is unavailable.");
    } else {
      const release = parseOsRelease(osReleaseText);
      const combinedName = [release.NAME, release.VERSION_ID]
        .filter((value): value is string => Boolean(value))
        .join(" ");
      osNameOverride = release.PRETTY_NAME || combinedName || null;
    }

    disk = settledValue(diskResult);
  } else if (platform === "darwin") {
    const [vmStatResult, swapResult, swVersResult, diskResult] =
      await Promise.allSettled([
        runBoundedCommand("/usr/bin/vm_stat", [], signal),
        runBoundedCommand("/usr/sbin/sysctl", ["-n", "vm.swapusage"], signal),
        runBoundedCommand("/usr/bin/sw_vers", [], signal),
        collectDisk(platform, signal),
      ]);
    throwIfAborted(signal);

    const vmStatText = settledValue(vmStatResult);
    if (vmStatText === null) {
      pushIssue(
        issues,
        "memory",
        "macOS memory details are unavailable; Node's free-memory counter is shown instead.",
      );
    } else {
      try {
        memory = calculateMacMemory(parseVmStat(vmStatText), memory.totalBytes);
      } catch {
        pushIssue(
          issues,
          "memory",
          "macOS memory details could not be parsed; Node's free-memory counter is shown instead.",
        );
      }
    }

    const swapText = settledValue(swapResult);
    if (swapText === null) {
      pushIssue(issues, "swap", "macOS swap details are unavailable.");
    } else {
      try {
        swap = parseMacSwapUsage(swapText);
      } catch {
        pushIssue(issues, "swap", "macOS swap details could not be parsed.");
      }
    }

    const swVersText = settledValue(swVersResult);
    if (swVersText === null) {
      pushIssue(issues, "system", "The friendly macOS version is unavailable.");
    } else {
      const swVers = parseSwVers(swVersText);
      osNameOverride = [swVers.productName ?? "macOS", swVers.productVersion]
        .filter((value): value is string => Boolean(value))
        .join(" ");
    }
    disk = settledValue(diskResult);
  } else {
    try {
      disk = await collectDisk(platform, signal);
    } catch {
      throwIfAborted(signal);
    }
    if (platform === "win32") {
      pushIssue(
        issues,
        "swap",
        "Windows page-file usage is not exposed by Node's built-in system APIs.",
      );
    } else {
      pushIssue(issues, "swap", "Swap usage is unsupported on this platform.");
    }
  }

  if (disk === null) {
    pushIssue(issues, "disk", "The system volume could not be measured.");
  }
  throwIfAborted(signal);

  const sampledAtMs = Math.max(0, Math.round(Date.now()));
  const snapshot: MachineSnapshot = {
    sampledAtMs,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    system: buildSystem(platform, sampledAtMs, osNameOverride, issues),
    network: networkThroughput,
    cpu,
    memory,
    swap,
    disk,
    issues,
  };
  assertStrictJson(snapshot);
  return snapshot;
}
