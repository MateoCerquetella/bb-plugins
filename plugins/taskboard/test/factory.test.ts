import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import type { WorkItem } from '../contract.ts';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
    }
    return next(specifier, context);
  }
});
const { newRecord, savePlan, approvePlan, startRun } = await import('../factory/state.ts');
const { createFactoryStore } = await import('../factory/store.ts');
const { createFactoryService, applyNativeEvent, factoryPrompt } = await import('../factory/service.ts');
const item: WorkItem = {
  bbProjectId: 'proj_test', source: 'gitlab', locator: 'gitlab.com/group/repo#12',
  key: '#12', title: 'Keep panel open', description: 'Show progress.', url: 'https://gitlab.com/group/repo/-/issues/12',
  status: 'Open', stateCategory: 'todo', priority: null, assignee: null,
  project: null, labels: [], updatedAt: new Date().toISOString()
};
function fixture() {
  const db = new Database(':memory:');
  const store = createFactoryStore(db);
  let spawns = 0;
  let failSpawn = false;
  const events: Parameters<typeof applyNativeEvent>[1][] = [];
  const sdk = {
    threads: {
      spawn: async () => {
        spawns++;
        if (failSpawn) throw new Error('Response lost');
        return { id: 'thr_native', environmentId: 'env_test', projectId: item.bbProjectId };
      },
      get: async () => ({ id: 'thr_native', status: 'idle', projectId: item.bbProjectId, environmentId: 'env_test', providerId: 'codex' }),
      defaultExecutionOptions: async () => ({ model: 'test', permissionMode: 'accept-edits', reasoningLevel: 'medium', serviceTier: 'default' }),
      send: async () => ({}),
      events: { list: async (input: { limit?: string }) => {
        assert.ok(Number(input.limit) <= 100, 'Native event limit must not exceed 100');
        return events;
      } },
      output: async () => ({ output: 'Observed repository findings' })
    },
    projects: { defaultExecutionOptions: async () => ({ model: 'test', providerId: 'codex' }) },
    environments: { get: async () => ({ id: 'env_test', managed: true, isWorktree: true, hostId: 'host_test' }) }
  } as unknown as Parameters<typeof createFactoryService>[0];
  const service = createFactoryService(sdk, store, () => {});
  return { db, store, service, events, spawns: () => spawns, fail: () => { failSpawn = true; } };
}
test('immutable plan revisions and exact approvals gate Build', () => {
  const record = newRecord(item);
  assert.throws(() => startRun(record, 'build', false), /Approve/);
  savePlan(record, 'Implement and test');
  const plan = record.plans[0];
  approvePlan(record, plan.digest);
  savePlan(record, 'Implement changed scope and test');
  assert.equal(record.plans.length, 2);
  assert.equal(record.plans[0].body, 'Implement and test');
  assert.equal(record.approvedDigest, null);
  assert.throws(() => approvePlan(record, plan.digest), /stale/);
  assert.throws(() => startRun(record, 'build', false), /Approve/);
});
test('successful turn never completes work or updates tracker status', () => {
  const record = newRecord(item);
  const run = startRun(record, 'investigate', false);
  applyNativeEvent(run, {
    id: 'e', threadId: 'thr_native', seq: 1, createdAt: Date.now(),
    scope: { kind: 'turn', turnId: 'turn_1' }, type: 'turn/completed',
    data: { status: 'completed', providerThreadId: null }
  });
  assert.equal(run.status, 'finished');
  assert.equal(record.stage, 'Triage');
  assert.equal(item.status, 'Open');
});
test('concurrent and stale duplicate starts spawn exactly once', async () => {
  const f = fixture();
  try {
    const input = { expectedVersion: 0, kind: 'investigate' as const, contextThreadId: null, retry: false };
    const [a, b] = await Promise.all([f.service.start(item, input), f.service.start(item, input)]);
    assert.equal(f.spawns(), 1);
    assert.equal(a.runs[0].threadId, b.runs[0].threadId);
    assert.equal(f.store.forThread('thr_native')?.locator, item.locator);
  } finally { f.db.close(); }
});
test('crash recovery preserves an ambiguous intent and refuses duplicate dispatch', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    startRun(record, 'investigate', false);
    f.store.save(record);
    await f.service.recover();
    const recovered = f.store.all()[0];
    assert.equal(recovered.runs[0].status, 'uncertain');
    await assert.rejects(f.service.start(item, {
      expectedVersion: recovered.version, kind: 'investigate', contextThreadId: null, retry: true
    }), /uncertain/);
    assert.equal(f.spawns(), 0);
  } finally { f.db.close(); }
});
test('lost spawn response is uncertain, not a retryable failure', async () => {
  const f = fixture();
  try {
    f.fail();
    const record = await f.service.start(item, {
      expectedVersion: 0, kind: 'investigate', contextThreadId: null, retry: false
    });
    assert.equal(record.runs[0].status, 'uncertain');
    await assert.rejects(f.service.start(item, {
      expectedVersion: record.version, kind: 'investigate', contextThreadId: null, retry: true
    }), /uncertain/);
    assert.equal(f.spawns(), 1);
  } finally { f.db.close(); }
});
test('native cancellation stays separate and retries are bounded', () => {
  const record = newRecord(item);
  for (let i = 0; i < 3; i++) {
    const run = startRun(record, 'investigate', i > 0);
    applyNativeEvent(run, {
      id: String(i), threadId: 'thr_native', seq: i + 1, createdAt: Date.now(),
      scope: { kind: 'thread' }, type: 'system/thread/interrupted', data: { reason: 'manual-stop' }
    });
    assert.equal(run.status, 'canceled');
  }
  assert.throws(() => startRun(record, 'investigate', true), /Retry limit/);
  assert.equal(record.stage, 'Triage');
});
test('scope change invalidates approval and optimistic revisions reject stale edits', async () => {
  const f = fixture();
  try {
    let record = newRecord(item);
    savePlan(record, 'Initial plan'); approvePlan(record, record.plans[0].digest);
    record = f.store.save(record);
    const refreshed = await f.service.get({ ...item, description: 'Changed scope' });
    assert.equal(refreshed.approvedDigest, null);
    await assert.rejects(f.service.savePlan({ ...item, description: 'Changed scope' }, record.version, 'New plan'), /changed/);
  } finally { f.db.close(); }
});
test('additive storage preserves unrelated preparation data across reopen', () => {
  const f = fixture();
  try {
    f.db.exec('CREATE TABLE preparation_user_data (body TEXT); INSERT INTO preparation_user_data VALUES (\'preserve\')');
    f.store.save(newRecord(item));
    const reopened = createFactoryStore(f.db);
    assert.equal(reopened.all().length, 1);
    assert.equal(f.db.prepare('SELECT body FROM preparation_user_data').pluck().get(), 'preserve');
  } finally { f.db.close(); }
});
test('prompts keep tracker data untrusted and impose no Empirical runtime', () => {
  const prompt = factoryPrompt(item, newRecord(item), 'investigate');
  assert.match(prompt, /UNTRUSTED EXTERNAL TRACKER DATA/);
  assert.doesNotMatch(prompt, /empirical|symphony|langgraph/i);
  assert.match(prompt, /Do not implement yet/);
});
test('old terminal events cannot complete a different native turn', () => {
  const record = newRecord(item);
  const run = startRun(record, 'investigate', false);
  run.turnId = 'current-turn';
  applyNativeEvent(run, {
    id: 'stale', threadId: 'thr_native', seq: 1, createdAt: Date.now(),
    scope: { kind: 'turn', turnId: 'old-turn' }, type: 'turn/completed',
    data: { status: 'completed', providerThreadId: null }
  });
  assert.equal(run.status, 'starting');
});
test('native polling observes completion and persists the result', async () => {
  const f = fixture();
  try {
    await f.service.start(item, { expectedVersion: 0, kind: 'investigate', contextThreadId: null, retry: false });
    f.events.push({
      id: 'completed', threadId: 'thr_native', seq: 1, createdAt: Date.now(),
      scope: { kind: 'turn', turnId: 'turn_1' }, type: 'turn/completed',
      data: { status: 'completed', providerThreadId: null }
    });
    const record = await f.service.get(item);
    assert.equal(record.runs[0].status, 'finished');
    assert.equal(record.runs[0].output, 'Observed repository findings');
    assert.equal(f.store.forThread('thr_native')?.stage, 'Triage');
    assert.equal(record.runs[0].cursor, 1);
  } finally { f.db.close(); }
});
test('Review requires approved, completed Build and never implies acceptance', () => {
  const record = newRecord(item);
  savePlan(record, 'Implement current scope');
  approvePlan(record, record.plans[0].digest);
  assert.throws(() => startRun(record, 'review', false), /Finish/);
  const build = startRun(record, 'build', false);
  build.status = 'finished';
  const review = startRun(record, 'review', false);
  review.status = 'finished';
  assert.equal(record.stage, 'Review');
  assert.equal(item.status, 'Open');
});
test('recovery rejects a different project thread', async () => {
  const f = fixture();
  try {
    const record = newRecord({ ...item, bbProjectId: 'proj_other' });
    startRun(record, 'investigate', false);
    f.store.save(record);
    await f.service.recover();
    const recovered = f.store.all()[0];
    await assert.rejects(f.service.linkRecovered(
      { ...item, bbProjectId: 'proj_other' }, recovered.version, 'thr_native'
    ), /project/);
    assert.equal(f.spawns(), 0);
  } finally { f.db.close(); }
});
