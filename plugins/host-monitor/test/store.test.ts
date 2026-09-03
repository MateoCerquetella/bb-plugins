import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { MAX_RENDER_POINTS } from "../monitor.ts";
import { HostMonitorStore, hostMonitorMigrations } from "../store.ts";

test("history never returns more than 720 range-relative buckets", () => {
  const db = new Database(":memory:");
  try {
    for (const migration of hostMonitorMigrations) db.exec(migration);
    const store = new HostMonitorStore(db);
    const since = 1_001;
    const until = since + 30 * 24 * 60 * 60_000;
    for (let index = 0; index <= 900; index += 1) {
      const collectedAt = Math.round(since + (until - since) * index / 900);
      store.insert({
        collectedAt,
        cpuPercent: index % 100,
        memoryUsedBytes: 1,
        memoryTotalBytes: 2,
        diskUsedBytes: 1,
        diskTotalBytes: 2,
        load1: 1,
        load5: 1,
      });
    }
    const history = store.history(since, until);
    assert.ok(history.length > 0);
    assert.ok(history.length <= MAX_RENDER_POINTS);
    assert.ok(history.every((sample) => sample.collectedAt >= since));
  } finally {
    db.close();
  }
});
