import { execFile } from "node:child_process";
import { access, readFile, readdir, readlink, statfs } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";

export const SAMPLE_INTERVAL_MS = 30_000;
export const RETENTION_MS = 30 * 24 * 60 * 60_000;
export const MAX_RENDER_POINTS = 720;
export const DIRECTORY_SAMPLE_INTERVAL_MS = 15 * 60_000;
export const MEMORY_DIAGNOSTICS_INTERVAL_MS = 60_000;
export const MEMORY_PRESSURE_INTERVAL_MS = 5_000;
export const MEMORY_PRESSURE_CAPTURE_MS = 5 * 60_000;
export const MEMORY_DIAGNOSTICS_RETENTION_MS = 7 * 24 * 60 * 60_000;
export const MAX_MEMORY_DIAGNOSTICS_SNAPSHOTS = 20_000;
const MAX_PROCESS_SCAN = 2_048;
const MAX_REPORTED_PROCESSES = 12;
const PROCESS_READ_CONCURRENCY = 16;
const execFileAsync = promisify(execFile);

export const MONITORED_DIRECTORIES = [
  { id: "go", label: "Go cache", paths: ["go/pkg/mod", ".cache/go-build"] },
  { id: "rust", label: "Rust cache", paths: [".cargo/registry", ".cargo/git"] },
  { id: "bun", label: "Bun cache", paths: [".bun/install/cache"] },
  { id: "pnpm", label: "pnpm store", paths: [".local/share/pnpm/store", ".pnpm-store"] },
  { id: "npm", label: "npm cache", paths: [".npm"] },
  { id: "tmp", label: "/tmp", paths: ["/tmp"] },
  { id: "bb", label: "~/.bb", paths: [".bb"] },
] as const;

export type CpuCounters = { total: number; idle: number };

export type MachineSample = {
  collectedAt: number;
  cpuPercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  load1: number | null;
  load5: number | null;
};

export type DirectorySample = { collectedAt: number; location: string; bytes: number };

type ProcessCounters = { rssBytes: number; minorFaults: number; majorFaults: number };
type SystemMemoryCounters = { swapInPages: number; swapOutPages: number; refaultPages: number; reclaimPages: number };
export type MemoryProcess = {
  pid: number;
  startTime: number;
  name: string;
  workload: string;
  workloadDetail: string | null;
  rssBytes: number;
  rssDeltaBytes: number | null;
  minorFaultsPerSecond: number | null;
  majorFaultsPerSecond: number | null;
};
export type MemoryDiagnostics = {
  collectedAt: number;
  processDetailsCollectedAt: number | null;
  sampleIntervalMs: number | null;
  pressureSomePercent: number | null;
  pressureFullPercent: number | null;
  swapInPagesPerSecond: number | null;
  swapOutPagesPerSecond: number | null;
  refaultPagesPerSecond: number | null;
  reclaimPagesPerSecond: number | null;
  bbCgroupMemoryBytes: number | null;
  processes: MemoryProcess[];
};
export type MemoryDiagnosticState = {
  collectedAt: number;
  processes: Map<string, ProcessCounters>;
  system: SystemMemoryCounters | null;
  reportedProcesses: MemoryProcess[];
  processDetailsCollectedAt: number | null;
};

export function cpuPercent(previous: CpuCounters | null, current: CpuCounters): number | null {
  if (previous == null) return null;
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0 || idleDelta < 0) return null;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

export function parseMeminfo(source: string): { total: number; available: number } | null {
  const values = new Map<string, number>();
  for (const line of source.split("\n")) {
    const match = /^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/i.exec(line.trim());
    if (match != null) values.set(match[1]!.toLowerCase(), Number(match[2]) * 1024);
  }
  const total = values.get("memtotal");
  const available = values.get("memavailable");
  return total != null && available != null ? { total, available } : null;
}

export function parseCpuCounters(source: string): CpuCounters | null {
  const line = source.split("\n").find((entry) => entry.startsWith("cpu "));
  if (line == null) return null;
  const fields = line.trim().split(/\s+/).slice(1).map(Number);
  if (fields.length < 4 || fields.some((value) => !Number.isFinite(value))) return null;
  const total = fields.reduce((sum, value) => sum + value, 0);
  return { total, idle: (fields[3] ?? 0) + (fields[4] ?? 0) };
}

export function parseMemoryPressure(source: string): { some: number | null; full: number | null } {
  const value = (kind: "some" | "full") => {
    const match = new RegExp(`^${kind}\\s+avg10=([0-9.]+)`, "m").exec(source);
    const parsed = match == null ? NaN : Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return { some: value("some"), full: value("full") };
}

export function parseVmstat(source: string): SystemMemoryCounters | null {
  const values = new Map<string, number>();
  for (const line of source.split("\n")) {
    const match = /^(pswpin|pswpout|workingset_refault_anon|workingset_refault_file|pgscan_kswapd|pgscan_direct)\s+(\d+)$/.exec(line.trim());
    if (match != null) values.set(match[1]!, Number(match[2]));
  }
  const required = ["pswpin", "pswpout", "workingset_refault_anon", "workingset_refault_file", "pgscan_kswapd", "pgscan_direct"];
  if (required.some((key) => !Number.isFinite(values.get(key)))) return null;
  return {
    swapInPages: values.get("pswpin")!,
    swapOutPages: values.get("pswpout")!,
    refaultPages: values.get("workingset_refault_anon")! + values.get("workingset_refault_file")!,
    reclaimPages: values.get("pgscan_kswapd")! + values.get("pgscan_direct")!,
  };
}

export function parseProcessStat(source: string, pageSize: number): (ProcessCounters & { pid: number; startTime: number; name: string }) | null {
  const end = source.lastIndexOf(")");
  const start = source.indexOf("(");
  if (start < 1 || end <= start) return null;
  const pid = Number(source.slice(0, start).trim());
  const fields = source.slice(end + 1).trim().split(/\s+/);
  const minorFaults = Number(fields[7]);
  const majorFaults = Number(fields[9]);
  const startTime = Number(fields[19]);
  const rssPages = Number(fields[21]);
  if (![pid, minorFaults, majorFaults, startTime, rssPages].every(Number.isFinite) || rssPages < 0) return null;
  return { pid, name: source.slice(start + 1, end), startTime, minorFaults, majorFaults, rssBytes: rssPages * pageSize };
}

function humanize(value: string): string {
  return value.replace(/\.[cm]?[jt]sx?$/i, "").replace(/[-_.]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactCgroup(source: string | null): string | null {
  const path = source?.split("\n").find((line) => line.startsWith("0::"))?.slice(3);
  if (path == null || path === "/") return null;
  const leaf = path.split("/").filter(Boolean).at(-1);
  return leaf == null ? null : humanize(leaf.replace(/\.(service|scope)$/, ""));
}

function workloadFromPath(path: string | undefined): { name: string; kind: string } | null {
  if (path == null) return null;
  if (path.includes(".codex-subscription-router/")) return { name: "Codex Subscription Router", kind: "Service" };
  const applicationHost = /(?:^|\/)pkg\/@application-hosts\/([^/]+)/.exec(path)?.[1];
  if (applicationHost != null) return { name: humanize(applicationHost), kind: "Application host" };
  const bbPackage = /\/packages\/([^/]+)/.exec(path)?.[1];
  if (bbPackage != null) return { name: humanize(bbPackage), kind: "BB package" };
  const source = /\/([^/]+)\/(?:src\/)?[^/]+\.[cm]?[jt]sx?$/.exec(path)?.[1];
  if (source != null && !["src", "dist", "lib", "scripts"].includes(source)) return { name: humanize(source), kind: "Script" };
  const file = path.split("/").at(-1);
  return file == null ? null : { name: humanize(file), kind: "Script" };
}

export function describeProcessWorkload(input: { name: string; args: string[]; cwd: string | null; cgroup: string | null }): Pick<MemoryProcess, "workload" | "workloadDetail"> {
  const executable = input.name.toLowerCase();
  const args = input.args.slice(1);
  const runIndex = args.indexOf("run");
  const script = runIndex >= 0 ? args[runIndex + 1] : args.find((arg) => /\.[cm]?[jt]sx?$/i.test(arg));
  const pathIdentity = workloadFromPath(script) ?? workloadFromPath(args.find((arg) => arg.startsWith("/")));
  const cwdIdentity = workloadFromPath(input.cwd ?? undefined);
  const identity = pathIdentity ?? (runIndex >= 0 && script != null ? { name: humanize(script), kind: "Run target" } : cwdIdentity);
  const runtime = executable === "bun" ? "Bun" : executable === "node" ? "Node" : humanize(input.name);
  if (identity != null) return { workload: `${runtime} · ${identity.name}`, workloadDetail: identity.kind };
  return { workload: `${runtime} process`, workloadDetail: compactCgroup(input.cgroup) };
}

export async function collectSample(previousCpu: CpuCounters | null, collectedAt = Date.now()): Promise<{ sample: MachineSample; cpu: CpuCounters | null }> {
  const [meminfo, cpuinfo, filesystem] = await Promise.all([
    readFile("/proc/meminfo", "utf8").catch(() => null),
    readFile("/proc/stat", "utf8").catch(() => null),
    statfs("/").catch(() => null),
  ]);
  const memory = meminfo == null ? null : parseMeminfo(meminfo);
  const cpu = cpuinfo == null ? null : parseCpuCounters(cpuinfo);
  const blockSize = filesystem == null ? 0 : Number(filesystem.bsize);
  const diskTotalBytes = filesystem == null ? null : Number(filesystem.blocks) * blockSize;
  const diskUsedBytes = filesystem == null ? null : (Number(filesystem.blocks) - Number(filesystem.bavail)) * blockSize;
  const [load1, load5] = os.loadavg();
  return {
    cpu,
    sample: {
      collectedAt,
      cpuPercent: cpu == null ? null : cpuPercent(previousCpu, cpu),
      memoryUsedBytes: memory == null ? null : memory.total - memory.available,
      memoryTotalBytes: memory?.total ?? null,
      diskUsedBytes: Number.isFinite(diskUsedBytes) ? diskUsedBytes : null,
      diskTotalBytes: Number.isFinite(diskTotalBytes) ? diskTotalBytes : null,
      load1: Number.isFinite(load1) ? load1 : null,
      load5: Number.isFinite(load5) ? load5 : null,
    },
  };
}

export function bucketSizeFor(rangeMs: number): number {
  return Math.max(SAMPLE_INTERVAL_MS, Math.ceil(rangeMs / MAX_RENDER_POINTS / 1_000) * 1_000);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Machine monitor collection aborted", "AbortError");
}

export async function collectDirectorySamples(collectedAt = Date.now(), signal?: AbortSignal): Promise<DirectorySample[]> {
  const home = os.homedir();
  const results: DirectorySample[] = [];
  for (const location of MONITORED_DIRECTORIES) {
    throwIfAborted(signal);
    const paths = location.paths.map((path) => path.startsWith("/") ? path : `${home}/${path}`);
    const existing = (await Promise.all(paths.map(async (path) => {
      try { await access(path); return path; } catch { return null; }
    }))).filter((path): path is string => path != null);
    if (existing.length === 0) continue;
    try {
      const { stdout } = await execFileAsync("du", ["-sk", "--", ...existing], { timeout: 45_000, maxBuffer: 64 * 1024, signal });
      const bytes = stdout.split("\n").reduce((total, line) => {
        const kibibytes = Number(/^\s*(\d+)\s/.exec(line)?.[1]);
        return Number.isFinite(kibibytes) ? total + kibibytes * 1024 : total;
      }, 0);
      results.push({ collectedAt, location: location.id, bytes });
    } catch (cause) {
      if (signal?.aborted) throw cause;
      // Directory diagnostics are best-effort. The core health collector stays independent.
    }
  }
  return results;
}

function rate(current: number, previous: number | undefined, intervalMs: number | null): number | null {
  if (previous == null || intervalMs == null || intervalMs <= 0 || current < previous) return null;
  return (current - previous) / intervalMs * 1_000;
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, map: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const index = next++;
      results[index] = await map(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

let cgroupMemoryPath: string | null | undefined;

async function readBbCgroupMemory(): Promise<number | null> {
  if (cgroupMemoryPath === undefined) {
    const cgroup = await readFile("/proc/self/cgroup", "utf8").catch(() => null);
    const path = cgroup?.split("\n").find((line) => line.startsWith("0::"))?.slice(3);
    cgroupMemoryPath = path == null ? null : `/sys/fs/cgroup${path}/memory.current`;
  }
  if (cgroupMemoryPath == null) return null;
  const value = Number(await readFile(cgroupMemoryPath, "utf8").catch(() => ""));
  return Number.isFinite(value) ? value : null;
}

async function enrichProcessWorkload(process: Omit<MemoryProcess, "workload" | "workloadDetail">, signal?: AbortSignal): Promise<MemoryProcess> {
  const [cmdline, cwd, cgroup, currentStat] = await Promise.all([
    readFile(`/proc/${process.pid}/cmdline`, "utf8").catch(() => ""),
    readlink(`/proc/${process.pid}/cwd`).catch(() => null),
    readFile(`/proc/${process.pid}/cgroup`, "utf8").catch(() => null),
    readFile(`/proc/${process.pid}/stat`, { encoding: "utf8", signal }).catch(() => ""),
  ]);
  throwIfAborted(signal);
  const current = parseProcessStat(currentStat, 4_096);
  if (current == null || current.startTime !== process.startTime) {
    return { ...process, workload: `${humanize(process.name)} process`, workloadDetail: "Process changed" };
  }
  return { ...process, ...describeProcessWorkload({ name: process.name, args: cmdline.split("\0").filter(Boolean), cwd, cgroup }) };
}

export function memoryPressureActive(diagnostic: MemoryDiagnostics): boolean {
  return (diagnostic.pressureSomePercent ?? 0) >= 0.1 || (diagnostic.pressureFullPercent ?? 0) > 0;
}

export async function collectMemoryDiagnostics(previous: MemoryDiagnosticState | null, collectedAt = Date.now(), signal?: AbortSignal, options: { includeProcesses?: boolean; includeProcessDetails?: boolean } = {}): Promise<{ diagnostics: MemoryDiagnostics; state: MemoryDiagnosticState }> {
  throwIfAborted(signal);
  const intervalMs = previous == null ? null : Math.max(0, collectedAt - previous.collectedAt);
  const includeProcessDetails = options.includeProcessDetails ?? true;
  // Process enumeration itself exposes host-local PIDs and names. Skip the
  // scan entirely until the operator opts into attribution, rather than only
  // hiding the resulting rows at the RPC boundary.
  const includeProcesses = (options.includeProcesses ?? true) && includeProcessDetails;
  const [pressureSource, vmstatSource, cgroupBytes, entries] = await Promise.all([
    readFile("/proc/pressure/memory", { encoding: "utf8", signal }).catch(() => null),
    readFile("/proc/vmstat", { encoding: "utf8", signal }).catch(() => null),
    readBbCgroupMemory(),
    includeProcesses ? readdir("/proc", { withFileTypes: true }).catch(() => []) : Promise.resolve([]),
  ]);
  const pressure = pressureSource == null ? { some: null, full: null } : parseMemoryPressure(pressureSource);
  const system = vmstatSource == null ? null : parseVmstat(vmstatSource);
  const pageSize = 4_096;
  const pids = entries.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name)).sort((left, right) => Number(left.name) - Number(right.name)).slice(0, MAX_PROCESS_SCAN);
  const parsed = await mapWithConcurrency(pids, PROCESS_READ_CONCURRENCY, async (entry) =>
    parseProcessStat(await readFile(`/proc/${entry.name}/stat`, { encoding: "utf8", signal }).catch(() => ""), pageSize), signal);
  if (signal?.aborted) throw new DOMException("Memory diagnostics collection aborted", "AbortError");
  const processes = parsed.filter((entry): entry is NonNullable<typeof entry> => entry != null);
  const processState = includeProcesses ? new Map<string, ProcessCounters>() : previous?.processes ?? new Map<string, ProcessCounters>();
  const ranked = processes.map((process) => {
    const key = `${process.pid}:${process.startTime}`;
    const prior = previous?.processes.get(key);
    if (includeProcesses) processState.set(key, { rssBytes: process.rssBytes, minorFaults: process.minorFaults, majorFaults: process.majorFaults });
    return {
      pid: process.pid,
      startTime: process.startTime,
      name: process.name,
      rssBytes: process.rssBytes,
      rssDeltaBytes: prior == null ? null : process.rssBytes - prior.rssBytes,
      minorFaultsPerSecond: rate(process.minorFaults, prior?.minorFaults, intervalMs),
      majorFaultsPerSecond: rate(process.majorFaults, prior?.majorFaults, intervalMs),
    };
  });
  const largest = [...ranked].sort((left, right) => right.rssBytes - left.rssBytes).slice(0, 8);
  const faulting = [...ranked].sort((left, right) => (right.majorFaultsPerSecond ?? -1) - (left.majorFaultsPerSecond ?? -1));
  const reported = [...largest, ...faulting].filter((process, index, list) => list.findIndex((entry) => entry.pid === process.pid && entry.startTime === process.startTime) === index).slice(0, MAX_REPORTED_PROCESSES);
  const enrichedProcesses = !includeProcesses ? includeProcessDetails ? previous?.reportedProcesses ?? [] : [] : !includeProcessDetails ? [] : await Promise.all(reported.map((process) => enrichProcessWorkload(process, signal)));
  throwIfAborted(signal);
  const priorSystem = previous?.system;
  const diagnostics: MemoryDiagnostics = {
    collectedAt,
    processDetailsCollectedAt: includeProcessDetails ? includeProcesses ? collectedAt : previous?.processDetailsCollectedAt ?? null : null,
    sampleIntervalMs: intervalMs,
    pressureSomePercent: pressure.some,
    pressureFullPercent: pressure.full,
    swapInPagesPerSecond: system == null ? null : rate(system.swapInPages, priorSystem?.swapInPages, intervalMs),
    swapOutPagesPerSecond: system == null ? null : rate(system.swapOutPages, priorSystem?.swapOutPages, intervalMs),
    refaultPagesPerSecond: system == null ? null : rate(system.refaultPages, priorSystem?.refaultPages, intervalMs),
    reclaimPagesPerSecond: system == null ? null : rate(system.reclaimPages, priorSystem?.reclaimPages, intervalMs),
    bbCgroupMemoryBytes: cgroupBytes,
    processes: enrichedProcesses,
  };
  return { diagnostics, state: { collectedAt, processes: processState, system, reportedProcesses: enrichedProcesses, processDetailsCollectedAt: diagnostics.processDetailsCollectedAt } };
}
