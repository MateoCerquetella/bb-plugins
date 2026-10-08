import { createHash, randomUUID } from 'node:crypto';
import type { WorkItem } from '../contract.js';
import type { FactoryIdentity, FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';

export const factoryKey = (item: FactoryIdentity) =>
  JSON.stringify([item.projectId, item.source, item.locator]);
export const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const scopeDigest = (item: WorkItem) =>
  digest([item.title, item.description]);
export const latestRun = (record: FactoryRecord) => record.runs.at(-1);
export const activeRun = (record: FactoryRecord) =>
  record.runs.find(run => ['starting', 'running', 'uncertain'].includes(run.status));
export function newRecord(item: WorkItem): FactoryRecord {
  return {
    schemaVersion: 1, projectId: item.bbProjectId, source: item.source,
    locator: item.locator, version: 0, stage: 'Intake',
    scopeDigest: scopeDigest(item), plans: [], approvedDigest: null, runs: [],
    updatedAt: new Date().toISOString()
  };
}
export function assertVersion(record: FactoryRecord, expected: number) {
  if (record.version !== expected) throw new Error('Progress changed. Refresh before trying again.');
}
export function savePlan(record: FactoryRecord, body: string) {
  if (activeRun(record)) throw new Error('Wait for the active or uncertain dispatch before editing the plan.');
  const text = body.trim();
  const hash = digest([record.scopeDigest, text]);
  if (record.plans.at(-1)?.digest === hash) return;
  record.plans.push({
    revision: record.plans.length + 1, body: text, digest: hash,
    scopeDigest: record.scopeDigest, createdAt: new Date().toISOString()
  });
  record.approvedDigest = null;
  record.stage = 'Planning';
}
export function approvePlan(record: FactoryRecord, hash: string) {
  if (activeRun(record)) throw new Error('Wait for the active dispatch before approving a plan.');
  const plan = record.plans.at(-1);
  if (!plan || plan.digest !== hash || plan.scopeDigest !== record.scopeDigest) {
    throw new Error('This plan is stale. Save and approve the current scope.');
  }
  record.approvedDigest = hash;
}
export function startRun(record: FactoryRecord, kind: FactoryRunKind, retry: boolean) {
  const active = activeRun(record);
  if (active) throw new Error(active.status === 'uncertain'
    ? 'Dispatch outcome is uncertain. Inspect the native thread before starting more work.'
    : 'A native session is already working on this item.');
  const prior = record.runs.filter(run => run.kind === kind);
  const last = prior.at(-1);
  if (retry && (!last || !['failed', 'canceled'].includes(last.status))) {
    throw new Error('Only confirmed failed or canceled runs can be retried.');
  }
  if (retry && prior.filter(run => run.planDigest === record.approvedDigest).length >= 3) {
    throw new Error('Retry limit reached (three attempts). Inspect the native session.');
  }
  if (!retry && last && ['failed', 'canceled'].includes(last.status)) {
    throw new Error('Use the explicit retry action for this stage.');
  }
  if (kind === 'plan' && !record.runs.some(run => run.kind === 'investigate' && run.status === 'finished')) {
    throw new Error('Inspect completed investigation findings before generating a plan.');
  }
  if (kind === 'build' || kind === 'review') {
    const plan = record.plans.at(-1);
    if (!plan || record.approvedDigest !== plan.digest || plan.scopeDigest !== record.scopeDigest) {
      throw new Error('Approve the exact current plan revision first.');
    }
  }
  const latestBuild = record.runs.filter(run => run.kind === 'build').at(-1);
  if (kind === 'review' && (latestBuild?.status !== 'finished' ||
    latestBuild.planDigest !== record.approvedDigest)) {
    throw new Error('Finish the approved build before requesting review.');
  }
  const run: FactoryRun = {
    id: randomUUID(), kind, status: 'starting' as const, threadId: null,
    environmentId: null, cursor: 0, turnId: null,
    planDigest: record.approvedDigest, activity: 'Starting native BB session',
    error: null, output: '', checks: [], changedFiles: [], steps: [],
    startedAt: new Date().toISOString(), finishedAt: null
  };
  record.runs.push(run);
  record.stage = ({ investigate: 'Triage', plan: 'Planning', build: 'Build', review: 'Review' } as const)[kind];
  return run;
}
