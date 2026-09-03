import type Database from "better-sqlite3";

import { bucketSizeFor, type DirectorySample, type MachineSample, type MemoryDiagnostics } from "./monitor.ts";

export const hostMonitorMigrations = [
  `CREATE TABLE IF NOT EXISTS machine_samples (
    collected_at INTEGER PRIMARY KEY,
    cpu_percent REAL,
    memory_used_bytes INTEGER,
    memory_total_bytes INTEGER,
    disk_used_bytes INTEGER,
    disk_total_bytes INTEGER,
    load1 REAL
  )`,
  `CREATE INDEX IF NOT EXISTS machine_samples_collected_at ON machine_samples(collected_at)`,
  `CREATE TABLE IF NOT EXISTS directory_samples (
    collected_at INTEGER NOT NULL,
    location TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    PRIMARY KEY (collected_at, location)
  )`,
  `CREATE INDEX IF NOT EXISTS directory_samples_location_collected_at ON directory_samples(location, collected_at)`,
  `ALTER TABLE machine_samples ADD COLUMN load5 REAL`,
  `CREATE TABLE IF NOT EXISTS memory_diagnostics (
    collected_at INTEGER PRIMARY KEY,
    sample_interval_ms INTEGER,
    pressure_some_percent REAL,
    pressure_full_percent REAL,
    swap_in_pages_per_second REAL,
    swap_out_pages_per_second REAL,
    refault_pages_per_second REAL,
    reclaim_pages_per_second REAL,
    bb_cgroup_memory_bytes INTEGER,
    processes_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS memory_diagnostics_collected_at ON memory_diagnostics(collected_at)`,
  `ALTER TABLE memory_diagnostics ADD COLUMN process_details_collected_at INTEGER`,
  `UPDATE memory_diagnostics SET processes_json = '[]'`,
];

export class HostMonitorStore {
  constructor(private readonly db: Database.Database) {}

  insert(sample: MachineSample): void {
    this.db.prepare(`INSERT OR REPLACE INTO machine_samples
      (collected_at, cpu_percent, memory_used_bytes, memory_total_bytes, disk_used_bytes, disk_total_bytes, load1, load5)
      VALUES (@collectedAt, @cpuPercent, @memoryUsedBytes, @memoryTotalBytes, @diskUsedBytes, @diskTotalBytes, @load1, @load5)`)
      .run(sample);
  }

  prune(before: number): void {
    this.db.prepare("DELETE FROM machine_samples WHERE collected_at < ?").run(before);
    this.db.prepare("DELETE FROM directory_samples WHERE collected_at < ?").run(before);
  }

  latest(): MachineSample | null {
    return this.db.prepare(`SELECT collected_at AS collectedAt, cpu_percent AS cpuPercent,
      memory_used_bytes AS memoryUsedBytes, memory_total_bytes AS memoryTotalBytes,
      disk_used_bytes AS diskUsedBytes, disk_total_bytes AS diskTotalBytes, load1, load5
      FROM machine_samples ORDER BY collected_at DESC LIMIT 1`).get() as MachineSample | undefined ?? null;
  }

  history(since: number, until: number): MachineSample[] {
    const bucketSize = bucketSizeFor(until - since);
    return this.db.prepare(`SELECT CAST((collected_at / @bucketSize) * @bucketSize AS INTEGER) AS collectedAt,
      AVG(cpu_percent) AS cpuPercent, AVG(memory_used_bytes) AS memoryUsedBytes,
      AVG(memory_total_bytes) AS memoryTotalBytes, AVG(disk_used_bytes) AS diskUsedBytes,
      AVG(disk_total_bytes) AS diskTotalBytes, AVG(load1) AS load1, AVG(load5) AS load5
      FROM machine_samples WHERE collected_at BETWEEN @since AND @until
      GROUP BY (collected_at / @bucketSize) ORDER BY collectedAt ASC`)
      .all({ since, until, bucketSize }) as MachineSample[];
  }

  insertDirectories(samples: DirectorySample[]): void {
    const insert = this.db.prepare("INSERT OR REPLACE INTO directory_samples (collected_at, location, bytes) VALUES (@collectedAt, @location, @bytes)");
    this.db.transaction((entries: DirectorySample[]) => entries.forEach((entry) => insert.run(entry)))(samples);
  }

  insertMemoryDiagnostics(diagnostics: MemoryDiagnostics): void {
    this.db.prepare(`INSERT OR REPLACE INTO memory_diagnostics
      (collected_at, sample_interval_ms, pressure_some_percent, pressure_full_percent,
       swap_in_pages_per_second, swap_out_pages_per_second, refault_pages_per_second,
       reclaim_pages_per_second, bb_cgroup_memory_bytes, processes_json, process_details_collected_at)
      VALUES (@collectedAt, @sampleIntervalMs, @pressureSomePercent, @pressureFullPercent,
       @swapInPagesPerSecond, @swapOutPagesPerSecond, @refaultPagesPerSecond,
       @reclaimPagesPerSecond, @bbCgroupMemoryBytes, @processesJson, @processDetailsCollectedAt)`)
      .run({ ...diagnostics, processesJson: JSON.stringify(diagnostics.processes) });
  }

  latestMemoryDiagnostics(): MemoryDiagnostics | null {
    const row = this.db.prepare(`SELECT collected_at AS collectedAt, sample_interval_ms AS sampleIntervalMs,
      pressure_some_percent AS pressureSomePercent, pressure_full_percent AS pressureFullPercent,
      swap_in_pages_per_second AS swapInPagesPerSecond, swap_out_pages_per_second AS swapOutPagesPerSecond,
      refault_pages_per_second AS refaultPagesPerSecond, reclaim_pages_per_second AS reclaimPagesPerSecond,
      bb_cgroup_memory_bytes AS bbCgroupMemoryBytes, processes_json AS processesJson,
      process_details_collected_at AS processDetailsCollectedAt
      FROM memory_diagnostics ORDER BY collected_at DESC LIMIT 1`).get() as (Omit<MemoryDiagnostics, "processes"> & { processesJson: string }) | undefined;
    if (row == null) return null;
    const { processesJson, ...diagnostics } = row;
    try { return { ...diagnostics, processes: JSON.parse(processesJson) as MemoryDiagnostics["processes"] }; } catch { return null; }
  }

  pruneMemoryDiagnostics(before: number, maxSnapshots: number): void {
    this.db.prepare("DELETE FROM memory_diagnostics WHERE collected_at < ?").run(before);
    this.db.prepare(`DELETE FROM memory_diagnostics WHERE collected_at NOT IN (
      SELECT collected_at FROM memory_diagnostics ORDER BY collected_at DESC LIMIT ?
    )`).run(maxSnapshots);
  }

  averageCpuSince(since: number): number | null {
    const row = this.db.prepare("SELECT AVG(cpu_percent) AS value FROM machine_samples WHERE collected_at >= ? AND cpu_percent IS NOT NULL").get(since) as { value: number | null };
    return row.value;
  }

  directorySummary(since: number, until: number): Array<{ location: string; bytes: number; collectedAt: number; firstBytes: number; firstCollectedAt: number }> {
    return this.db.prepare(`SELECT newest.location, newest.bytes, newest.collected_at AS collectedAt, first.bytes AS firstBytes, first.collected_at AS firstCollectedAt
      FROM directory_samples newest
      JOIN directory_samples first ON first.location = newest.location
      WHERE newest.collected_at = (SELECT MAX(collected_at) FROM directory_samples latest WHERE latest.location = newest.location AND latest.collected_at <= @until)
        AND first.collected_at = (SELECT MIN(collected_at) FROM directory_samples earliest WHERE earliest.location = newest.location AND earliest.collected_at >= @since AND earliest.collected_at <= @until)
      ORDER BY newest.location`).all({ since, until }) as Array<{ location: string; bytes: number; collectedAt: number; firstBytes: number; firstCollectedAt: number }>;
  }
}
