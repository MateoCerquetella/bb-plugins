import type Database from "better-sqlite3";

import type { HistoryPoint, MachineSnapshot } from "./contract.ts";

export const MAX_RENDER_POINTS = 720;
export const RETENTION_MS = 30 * 24 * 60 * 60_000;
export const SAMPLE_INTERVAL_MS = 10_000;

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
  `CREATE TABLE IF NOT EXISTS fleet_samples (
    host_id TEXT NOT NULL,
    collected_at INTEGER NOT NULL,
    cpu_percent REAL,
    memory_percent REAL,
    disk_percent REAL,
    receive_bytes_per_second INTEGER,
    send_bytes_per_second INTEGER,
    load1 REAL,
    load5 REAL,
    load15 REAL,
    PRIMARY KEY (host_id, collected_at)
  )`,
  `CREATE INDEX IF NOT EXISTS fleet_samples_host_collected_at
    ON fleet_samples(host_id, collected_at)`,
  `DELETE FROM fleet_samples`,
];

export function bucketSizeFor(rangeMs: number): number {
  return Math.max(
    SAMPLE_INTERVAL_MS,
    Math.ceil((Math.max(0, rangeMs) + 1) / MAX_RENDER_POINTS / 1_000) * 1_000,
  );
}

export class HostMonitorStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insert(hostId: string, snapshot: MachineSnapshot, collectedAtMs = Date.now()): void {
    this.db.prepare(`INSERT OR REPLACE INTO fleet_samples (
      host_id, collected_at, cpu_percent, memory_percent, disk_percent,
      receive_bytes_per_second, send_bytes_per_second, load1, load5, load15
    ) VALUES (
      @hostId, @collectedAtMs, @cpuPercent, @memoryPercent, @diskPercent,
      @receiveBytesPerSecond, @sendBytesPerSecond, @load1, @load5, @load15
    )`).run(toHistoryPoint(hostId, snapshot, collectedAtMs));
  }

  prune(before: number): void {
    this.db.prepare("DELETE FROM fleet_samples WHERE collected_at < ?").run(before);
  }

  history(hostId: string, since: number, until: number): HistoryPoint[] {
    const bucketSize = bucketSizeFor(until - since);
    const points = this.db.prepare(`SELECT
      CAST((((collected_at - @since) / @bucketSize) * @bucketSize) + @since AS INTEGER) AS collectedAtMs,
      AVG(cpu_percent) AS cpuPercent,
      AVG(memory_percent) AS memoryPercent,
      AVG(disk_percent) AS diskPercent,
      CAST(AVG(receive_bytes_per_second) AS INTEGER) AS receiveBytesPerSecond,
      CAST(AVG(send_bytes_per_second) AS INTEGER) AS sendBytesPerSecond,
      AVG(load1) AS load1,
      AVG(load5) AS load5,
      AVG(load15) AS load15
      FROM fleet_samples
      WHERE host_id = @hostId AND collected_at BETWEEN @since AND @until
      GROUP BY ((collected_at - @since) / @bucketSize)
      ORDER BY collectedAtMs ASC`).all({
        hostId,
        since,
        until,
        bucketSize,
      }) as HistoryPoint[];
    return points.slice(-MAX_RENDER_POINTS);
  }
}

function toHistoryPoint(hostId: string, snapshot: MachineSnapshot, collectedAtMs: number): HistoryPoint & { hostId: string } {
  return {
    hostId,
    collectedAtMs,
    cpuPercent: snapshot.cpu.usagePercent,
    memoryPercent: snapshot.memory.usagePercent,
    diskPercent: snapshot.disk?.usagePercent ?? null,
    receiveBytesPerSecond: snapshot.network.receiveBytesPerSecond,
    sendBytesPerSecond: snapshot.network.sendBytesPerSecond,
    load1: snapshot.cpu.loadAverage?.[0] ?? null,
    load5: snapshot.cpu.loadAverage?.[1] ?? null,
    load15: snapshot.cpu.loadAverage?.[2] ?? null,
  };
}
