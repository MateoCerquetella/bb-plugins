import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { factoryRecordSchema, type FactoryIdentity, type FactoryRecord } from './contract.js';
import { factoryKey } from './state.js';

export function createFactoryStore(db: ReturnType<BbPluginApi['storage']['database']>) {
  // Separate names avoid colliding with installed preparation migration numbers.
  db.exec(`
    CREATE TABLE IF NOT EXISTS taskboard_factory_v1 (
      identity TEXT PRIMARY KEY, version INTEGER NOT NULL, document TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taskboard_factory_threads_v1 (
      thread_id TEXT PRIMARY KEY, identity TEXT NOT NULL
    );
  `);
  const parse = (row: { document: string } | undefined) =>
    row ? factoryRecordSchema.parse(JSON.parse(row.document)) : null;
  return {
    get(identity: FactoryIdentity) {
      return parse(db.prepare<[string], { document: string }>(
        'SELECT document FROM taskboard_factory_v1 WHERE identity = ?'
      ).get(factoryKey(identity)));
    },
    forThread(threadId: string) {
      return parse(db.prepare<[string], { document: string }>(`
        SELECT f.document FROM taskboard_factory_v1 f
        JOIN taskboard_factory_threads_v1 t ON t.identity = f.identity
        WHERE t.thread_id = ?
      `).get(threadId));
    },
    all() {
      return db.prepare<[], { document: string }>(
        'SELECT document FROM taskboard_factory_v1'
      ).all().map(row => parse(row)!);
    },
    save(record: FactoryRecord) {
      const expected = record.version;
      const next = factoryRecordSchema.parse({
        ...record, version: expected + 1, updatedAt: new Date().toISOString()
      });
      db.transaction(() => {
        const key = factoryKey(record);
        const result = expected === 0
          ? db.prepare<[string, number, string]>(
            'INSERT OR IGNORE INTO taskboard_factory_v1 VALUES (?, ?, ?)'
          ).run(key, next.version, JSON.stringify(next))
          : db.prepare<[number, string, string, number]>(
            'UPDATE taskboard_factory_v1 SET version = ?, document = ? WHERE identity = ? AND version = ?'
          ).run(next.version, JSON.stringify(next), key, expected);
        if (result.changes !== 1) throw new Error('Progress changed in another request. Refresh and retry.');
        for (const run of next.runs) {
          if (!run.threadId) continue;
          const existing = db.prepare<[string], { identity: string }>(
            'SELECT identity FROM taskboard_factory_threads_v1 WHERE thread_id = ?'
          ).get(run.threadId);
          if (existing && existing.identity !== key) throw new Error('Thread belongs to another work item.');
          db.prepare<[string, string]>(
            'INSERT OR IGNORE INTO taskboard_factory_threads_v1 VALUES (?, ?)'
          ).run(run.threadId, key);
        }
      })();
      return next;
    }
  };
}
