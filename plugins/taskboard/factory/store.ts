import type { BbPluginApi } from '@get-bb/plugin-sdk';
import {
  factoryProjectPolicySchema, factoryRecordSchema, factoryScanObservationSchema,
  type FactoryIdentity, type FactoryProjectPolicy, type FactoryProjectStatus,
  type FactoryRecord, type FactoryScanObservation
} from './contract.js';
import { empiricalSnapshotSchema, type EmpiricalSnapshot } from '../empirical/contract.js';
import { factoryKey } from './state.js';

export function consumesFactoryCapacity(record: FactoryRecord) {
  if (record.admission.kind !== 'factory' || record.stage === 'Done') return false;
  const last = record.runs.at(-1);
  return !(last?.kind === 'review' && last.status === 'finished' &&
    last.reviewResult?.verdict === 'passed');
}

export function createFactoryStore(db: ReturnType<BbPluginApi['storage']['database']>) {
  // Separate names avoid colliding with installed preparation migration numbers.
  db.exec(`
    CREATE TABLE IF NOT EXISTS taskboard_factory_v1 (
      identity TEXT PRIMARY KEY, version INTEGER NOT NULL, document TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taskboard_factory_threads_v1 (
      thread_id TEXT PRIMARY KEY, identity TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taskboard_factory_empirical_v1 (
      identity TEXT PRIMARY KEY, observed_at INTEGER NOT NULL, document TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taskboard_factory_projects_v1 (
      project_id TEXT PRIMARY KEY, document TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS taskboard_factory_scans_v1 (
      project_id TEXT PRIMARY KEY, document TEXT NOT NULL
    );
  `);
  const parse = (row: { document: string } | undefined) =>
    row ? factoryRecordSchema.parse(JSON.parse(row.document)) : null;
  return {
    projectPolicies() {
      return db.prepare<[], { document: string }>(
        'SELECT document FROM taskboard_factory_projects_v1 ORDER BY project_id'
      ).all().map(row => factoryProjectPolicySchema.parse(JSON.parse(row.document)));
    },
    getProjectPolicy(projectId: string, provider: FactoryProjectPolicy['provider']): FactoryProjectPolicy {
      const row = db.prepare<[string], { document: string }>(
        'SELECT document FROM taskboard_factory_projects_v1 WHERE project_id = ?'
      ).get(projectId);
      if (row) return factoryProjectPolicySchema.parse(JSON.parse(row.document));
      return factoryProjectPolicySchema.parse({
        projectId, provider, enabled: false, intake: 'todo', maxConcurrent: 1,
        updatedAt: new Date().toISOString()
      });
    },
    saveProjectPolicy(policy: FactoryProjectPolicy) {
      const value = factoryProjectPolicySchema.parse({
        ...policy, updatedAt: new Date().toISOString()
      });
      db.prepare<[string, string]>(`
        INSERT INTO taskboard_factory_projects_v1 VALUES (?, ?)
        ON CONFLICT(project_id) DO UPDATE SET document = excluded.document
      `).run(value.projectId, JSON.stringify(value));
      return value;
    },
    getScan(projectId: string) {
      const row = db.prepare<[string], { document: string }>(
        'SELECT document FROM taskboard_factory_scans_v1 WHERE project_id = ?'
      ).get(projectId);
      return row ? factoryScanObservationSchema.parse(JSON.parse(row.document)) : null;
    },
    saveScan(observation: FactoryScanObservation) {
      const value = factoryScanObservationSchema.parse(observation);
      db.prepare<[string, string]>(`
        INSERT INTO taskboard_factory_scans_v1 VALUES (?, ?)
        ON CONFLICT(project_id) DO UPDATE SET document = excluded.document
      `).run(value.projectId, JSON.stringify(value));
      return value;
    },
    projectStatus(projectId: string, provider: FactoryProjectPolicy['provider']): FactoryProjectStatus {
      const policy = this.getProjectPolicy(projectId, provider);
      const records = this.all().filter(record => record.projectId === projectId);
      const active = records.filter(consumesFactoryCapacity).length;
      const scan = this.getScan(projectId);
      if (!policy.enabled) return active ? { kind: 'paused', policy, active } : { kind: 'disabled', policy };
      if (policy.provider !== provider) return { kind: 'blocked', policy, active,
        reason: 'Project provider changed. Save factory settings before continuing.' };
      if (scan?.kind === 'blocked') return { kind: 'blocked', policy, reason: scan.reason ?? 'Provider scan failed.', active };
      for (const record of records.filter(candidate => candidate.admission.kind === 'factory')) {
        const coordinator = record.coordinator;
        const run = record.runs.at(-1);
        const reason = record.automationError ??
          (coordinator && 'error' in coordinator ? coordinator.error : null) ??
          (run && (['uncertain', 'failed', 'canceled'].includes(run.status) || run.error)
            ? run.error ?? `Native ${run.kind} session ${run.status}. Inspect its recovery action.` : null);
        if (reason) return { kind: 'blocked', policy, active, reason: `${record.locator}: ${reason}` };
      }
      if (policy.enabled && !scan) return { kind: 'paused', policy, active };
      return { kind: 'running', policy, active, available: Math.max(0, policy.maxConcurrent - active) };
    },
    admit(item: FactoryIdentity & { scopeDigest: string }, policy: FactoryProjectPolicy) {
      const key = factoryKey(item);
      const claimedAt = new Date().toISOString();
      return db.transaction(() => {
        const stored = this.getProjectPolicy(policy.projectId, policy.provider);
        if (!stored.enabled || stored.provider !== policy.provider ||
          stored.intake !== policy.intake || stored.maxConcurrent !== policy.maxConcurrent ||
          stored.updatedAt !== policy.updatedAt || item.source !== policy.provider ||
          item.projectId !== policy.projectId) return { kind: 'disabled' as const };
        const existing = this.get(item);
        if (existing) return { kind: 'existing' as const, record: existing };
        const active = this.all().filter(record =>
          record.projectId === policy.projectId && consumesFactoryCapacity(record)).length;
        if (active >= stored.maxConcurrent) return { kind: 'capacity' as const };
        const record = factoryRecordSchema.parse({
          schemaVersion: 1, projectId: item.projectId, source: item.source,
          locator: item.locator, version: 1, stage: 'Intake',
          scopeDigest: item.scopeDigest, plans: [], approvedDigest: null,
          admission: { kind: 'factory', claimedAt }, automatic: true,
          coordinator: { status: 'pending' },
          automationError: null, trackerProgress: { status: 'pending', message: null },
          runs: [], updatedAt: claimedAt
        });
        db.prepare<[string, number, string]>(
          'INSERT INTO taskboard_factory_v1 VALUES (?, ?, ?)'
        ).run(key, 1, JSON.stringify(record));
        return { kind: 'admitted' as const, record };
      }).immediate();
    },
    get(identity: FactoryIdentity): FactoryRecord | null {
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
    all(): FactoryRecord[] {
      return db.prepare<[], { document: string }>(
        'SELECT document FROM taskboard_factory_v1'
      ).all().map(row => parse(row)!);
    },
    getEmpirical(identity: FactoryIdentity) {
      const row = db.prepare<[string], { document: string }>(
        'SELECT document FROM taskboard_factory_empirical_v1 WHERE identity = ?'
      ).get(factoryKey(identity));
      return row ? empiricalSnapshotSchema.parse(JSON.parse(row.document)) : null;
    },
    saveEmpirical(identity: FactoryIdentity, snapshot: EmpiricalSnapshot) {
      const value = empiricalSnapshotSchema.parse(snapshot);
      db.prepare<[string, number, string]>(`
        INSERT INTO taskboard_factory_empirical_v1 VALUES (?, ?, ?)
        ON CONFLICT(identity) DO UPDATE SET
          observed_at = excluded.observed_at, document = excluded.document
        WHERE taskboard_factory_empirical_v1.observed_at < excluded.observed_at
      `).run(factoryKey(identity), value.observedAt, JSON.stringify(value));
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
        const threadIds = next.runs.flatMap(run => run.threadId ? [run.threadId] : []);
        if (next.coordinator?.status === 'ready') threadIds.push(next.coordinator.threadId);
        for (const threadId of new Set(threadIds)) {
          const existing = db.prepare<[string], { identity: string }>(
            'SELECT identity FROM taskboard_factory_threads_v1 WHERE thread_id = ?'
          ).get(threadId);
          if (existing && existing.identity !== key) throw new Error('Thread belongs to another work item.');
          db.prepare<[string, string]>(
            'INSERT OR IGNORE INTO taskboard_factory_threads_v1 VALUES (?, ?)'
          ).run(threadId, key);
        }
      })();
      return next;
    }
  };
}
