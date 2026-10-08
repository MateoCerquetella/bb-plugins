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
const { factoryRecordSchema } = await import('../factory/contract.ts');
const { progressStatus } = await import('../factory/tracker.ts');
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
  let sends = 0;
  let progressWrites = 0;
  let failProgress = false;
  let output = 'Observed repository findings';
  let threadStatus = 'idle';
  let failSpawn = false;
  let rejectSpawn = false;
  let rejectWorktree = false;
  let managed = true;
  let spawnInput: unknown;
  const events: Parameters<typeof applyNativeEvent>[1][] = [];
  const sdk = {
    threads: {
      spawn: async (input: unknown) => {
        spawnInput = input;
        spawns++;
        if (rejectSpawn) throw new Error('HTTP 400: hostId is required unless workspace.type is personal');
        if (rejectWorktree) throw new Error('HTTP 409: This project checkout has no usable git branch.');
        if (failSpawn) throw new Error('Response lost');
        const fork = (input as { originKind?: string }).originKind === 'fork';
        return { id: fork ? 'thr_build' : 'thr_native', environmentId: fork ? 'env_build' : 'env_test', projectId: item.bbProjectId };
      },
      get: async ({ threadId }: { threadId: string }) => ({ id: threadId, status: threadStatus, projectId: item.bbProjectId, environmentId: threadId === 'thr_build' ? 'env_build' : 'env_test', providerId: 'codex' }),
      defaultExecutionOptions: async () => ({ model: 'test', permissionMode: 'accept-edits', reasoningLevel: 'medium', serviceTier: 'default' }),
      send: async () => { sends++; return {}; },
      events: { list: async (input: { limit?: string; order?: string; afterSeq?: string }) => {
        assert.ok(Number(input.limit) <= 100, 'Native event limit must not exceed 100');
        return input.order === 'desc' ? events.slice(-1) : events.filter(event => event.seq > Number(input.afterSeq ?? 0));
      } },
      output: async () => ({ output })
    },
    projects: { defaultExecutionOptions: async () => ({ model: 'test', providerId: 'codex' }) },
    environments: { get: async ({ environmentId }: { environmentId: string }) => ({ id: environmentId, managed: managed || environmentId === 'env_build', isWorktree: managed || environmentId === 'env_build', hostId: 'host_test' }) }
  } as unknown as Parameters<typeof createFactoryService>[0];
  const service = createFactoryService(sdk, store, () => {}, {
    getItem: () => item,
    async markInProgress() {
      progressWrites++;
      if (failProgress) throw new Error('Provider permission denied');
      return { status: 'synced', message: null };
    }
  });
  return {
    db, store, service, events, spawns: () => spawns, spawnInput: () => spawnInput,
    fail: () => { failSpawn = true; },
    sends: () => sends, progressWrites: () => progressWrites,
    threadStatus: (value: string) => { threadStatus = value; },
    unmanaged: () => { managed = false; },
    failProgress: (value = true) => { failProgress = value; },
    complete: (body = 'Implementation plan and verification commands') => {
      output = body;
      events.push({
        id: String(events.length + 1), threadId: 'thr_native', seq: events.length + 1, createdAt: Date.now(),
        scope: { kind: 'turn', turnId: `turn_${events.length + 1}` }, type: 'turn/completed',
        data: { status: 'completed', providerThreadId: null }
      });
    },
    reject: (value = true) => { rejectSpawn = value; },
    rejectWorktree: () => { rejectWorktree = true; }
  };
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
test('a start without thread context uses the project default environment', async () => {
  const f = fixture();
  try {
    await f.service.start(item, {
      expectedVersion: 0, kind: 'investigate', contextThreadId: null, retry: false
    });
    const input = f.spawnInput() as { environment: unknown };
    assert.deepEqual(input.environment, { type: 'project-default' });
  } finally { f.db.close(); }
});
test('a confirmed environment rejection is retryable and legacy records are repaired', async () => {
  const f = fixture();
  try {
    f.reject();
    let record = await f.service.start(item, {
      expectedVersion: 0, kind: 'investigate', contextThreadId: null, retry: false
    });
    assert.equal(record.runs[0].status, 'failed');
    f.reject(false);
    record = await f.service.start(item, {
      expectedVersion: record.version, kind: 'investigate', contextThreadId: null, retry: true
    });
    assert.equal(record.runs.at(-1)?.status, 'running');

    const legacyItem = { ...item, locator: 'gitlab.com/group/repo#legacy' };
    const legacy = newRecord(legacyItem);
    const run = startRun(legacy, 'investigate', false);
    run.status = 'uncertain';
    run.error = 'Native dispatch outcome uncertain: HTTP 400: hostId is required unless workspace.type is personal. Inspect recent BB threads; no automatic retry.';
    f.store.save(legacy);
    const repaired = await f.service.get(legacyItem);
    assert.equal(repaired.runs[0].status, 'failed');
    assert.match(repaired.runs[0].error ?? '', /Retry using the project default/);
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

test('Start task moves status once and automatically reuses the session through planning and build', async () => {
  const f = fixture();
  try {
    const [a, b] = await Promise.all([f.service.startTask(item, null), f.service.startTask(item, null)]);
    assert.equal(a.runs[0].threadId, b.runs[0].threadId);
    assert.equal(f.spawns(), 1);
    assert.equal(f.progressWrites(), 1);
    f.complete('Investigation findings');
    await f.service.poll(new AbortController().signal);
    let record = f.store.all()[0];
    assert.equal(record.runs.at(-1)?.kind, 'plan');
    assert.equal(f.sends(), 1);
    f.complete('Implement current scope and run npm test');
    await Promise.all([f.service.get(item), f.service.get(item), f.service.startTask(item, null)]);
    record = f.store.all()[0];
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(record.runs.at(-1)?.planDigest, record.plans[0].digest);
    assert.equal(record.approvedDigest, record.plans[0].digest);
    assert.equal(record.plans[0].body, 'Implement current scope and run npm test');
    assert.equal(f.sends(), 2);
    assert.equal(f.spawns(), 1);
    f.complete('Implemented and tested');
    record = await f.service.get(item);
    await f.service.startTask(item, null);
    assert.equal(record.stage, 'Build');
    assert.equal(record.runs.at(-1)?.status, 'finished');
    assert.equal(f.sends(), 2);
    assert.equal(f.progressWrites(), 1);
  } finally { f.db.close(); }
});

test('completion before native idle continues automatically on the next poll', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    f.threadStatus('active');
    f.complete('Investigation findings');
    let record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'finished');
    assert.equal(record.automationError, null);
    assert.equal(f.sends(), 0);
    f.threadStatus('idle');
    await f.service.poll(new AbortController().signal);
    record = f.store.all()[0];
    assert.equal(record.runs.at(-1)?.kind, 'plan');
    f.threadStatus('active');
    f.complete('Plan with verification');
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'finished');
    assert.equal(record.automationError, null);
    assert.equal(f.sends(), 1);
    f.threadStatus('idle');
    await f.service.poll(new AbortController().signal);
    record = f.store.all()[0];
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(f.sends(), 2);
    assert.equal(f.spawns(), 1);
  } finally { f.db.close(); }
});

test('planning in a project checkout forks Build into a managed worktree exactly once', async () => {
  const f = fixture();
  try {
    f.unmanaged();
    await f.service.startTask(item, null);
    f.complete('Investigation findings');
    await f.service.get(item);
    f.complete('Implement current scope and verify');
    const [record] = await Promise.all([f.service.get(item), f.service.get(item)]);
    const input = f.spawnInput() as { originKind: string; sourceThreadId: string; environment: unknown; prompt: string };
    assert.equal(input.originKind, 'fork');
    assert.equal(input.sourceThreadId, 'thr_native');
    assert.deepEqual(input.environment, {
      type: 'host', hostId: 'host_test', workspace: { type: 'managed-worktree', baseBranch: { kind: 'default' } }
    });
    assert.match(input.prompt, /Implement current scope and verify/);
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(record.runs.at(-1)?.threadId, 'thr_build');
    assert.equal(record.runs.at(-1)?.environmentId, 'env_build');
    assert.equal(f.store.forThread('thr_native')?.locator, item.locator);
    assert.equal(f.store.forThread('thr_build')?.locator, item.locator);
    assert.equal(f.spawns(), 2);
    assert.equal(f.sends(), 1);
    await f.service.startTask(item, null);
    assert.equal(f.spawns(), 2);
  } finally { f.db.close(); }
});

test('a lost Build fork response pauses without creating another worktree or changing status again', async () => {
  const f = fixture();
  try {
    f.unmanaged();
    await f.service.startTask(item, null);
    f.complete('Investigation findings');
    await f.service.get(item);
    f.fail();
    f.complete('Implement current scope and verify');
    let record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(record.runs.at(-1)?.status, 'uncertain');
    record = await f.service.startTask(item, null);
    assert.equal(record.runs.at(-1)?.status, 'uncertain');
    await f.service.poll(new AbortController().signal);
    assert.equal(f.spawns(), 2);
    assert.equal(f.progressWrites(), 1);
  } finally { f.db.close(); }
});

test('a broken checkout is a confirmed retryable Build failure, including legacy records', async () => {
  const f = fixture();
  try {
    f.unmanaged();
    await f.service.startTask(item, null);
    f.complete('Investigation findings');
    await f.service.get(item);
    f.rejectWorktree();
    f.complete('Implement current scope and verify');
    let record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(record.runs.at(-1)?.status, 'failed');
    assert.equal(record.runs.at(-1)?.threadId, null);
    assert.match(record.runs.at(-1)?.error ?? '', /Repair the project checkout, then retry/);
    await f.service.poll(new AbortController().signal);
    assert.equal(f.spawns(), 2);

    record.runs.at(-1)!.status = 'uncertain';
    record.runs.at(-1)!.error = 'Native dispatch outcome uncertain: HTTP 409: This project checkout has no usable git branch.. Inspect recent BB threads; no automatic retry.';
    f.store.save(record);
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'failed');
    assert.equal(f.spawns(), 2);
    assert.equal(f.progressWrites(), 1);
  } finally { f.db.close(); }
});

test('closing an issue during investigation pauses automatic dispatch', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    f.complete('Investigation findings');
    const record = await f.service.get({ ...item, stateCategory: 'done' });
    assert.equal(record.runs.at(-1)?.kind, 'investigate');
    assert.match(record.automationError!, /closed or canceled/);
    assert.equal(f.sends(), 0);
  } finally { f.db.close(); }
});

test('tracker failures are visible and retry independently without another agent dispatch', async () => {
  const f = fixture();
  try {
    f.failProgress();
    let record = await f.service.startTask(item, null);
    assert.equal(record.runs.at(-1)?.status, 'running');
    assert.equal(record.trackerProgress.status, 'failed');
    assert.match(record.trackerProgress.message!, /permission denied/);
    await f.service.get(item);
    assert.equal(f.progressWrites(), 1);
    f.failProgress(false);
    record = await f.service.retryStatus(item);
    assert.equal(record.trackerProgress.status, 'synced');
    assert.equal(f.progressWrites(), 2);
    assert.equal(f.spawns(), 1);
  } finally { f.db.close(); }
});

test('uncertain and rejected dispatches never change provider status', async () => {
  for (const mode of ['fail', 'reject'] as const) {
    const f = fixture();
    try {
      f[mode]();
      await f.service.startTask(item, null);
      assert.equal(f.progressWrites(), 0);
      await f.service.get(item);
      assert.equal(f.spawns(), 1);
    } finally { f.db.close(); }
  }
});

test('legacy completed planning resumes automatically after restart without another planning turn', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    const run = startRun(record, 'investigate', false);
    run.kind = 'plan'; run.threadId = 'thr_native'; run.environmentId = 'env_test';
    run.status = 'finished'; run.output = 'Existing plan to implement';
    const legacy = { ...record } as Partial<typeof record>;
    delete legacy.automatic; delete legacy.automationError; delete legacy.trackerProgress;
    f.store.save(factoryRecordSchema.parse(legacy));
    await f.service.recover();
    await f.service.poll(new AbortController().signal);
    const resumed = f.store.all()[0];
    assert.equal(resumed.runs.at(-1)?.kind, 'build');
    assert.equal(resumed.plans[0].body, 'Existing plan to implement');
    assert.equal(f.sends(), 1);
    assert.equal(f.spawns(), 0);
  } finally { f.db.close(); }
});

test('scope changes and an empty plan pause automatic build', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    f.complete('Findings');
    await f.service.get(item);
    f.complete('');
    let record = await f.service.get(item);
    assert.match(record.automationError!, /without a plan/);
    assert.equal(record.plans.length, 0);
    assert.equal(f.sends(), 1);
    await f.service.get(item);
    assert.equal(f.sends(), 1);
    const changed = { ...item, description: 'Changed requirements' };
    record = await f.service.get(changed);
    assert.equal(record.automatic, false);
    assert.match(record.automationError!, /scope changed/);
    record = await f.service.startTask(changed, null);
    assert.equal(record.runs.at(-1)?.kind, 'investigate');
    assert.equal(record.plans.length, 0);
  } finally { f.db.close(); }
});

test('only provider-supported In progress transitions are selected', () => {
  const option = (id: string, name: string, stateCategory: 'todo' | 'in_progress') => ({
    id, name, stateCategory, current: false
  });
  assert.equal(progressStatus([option('open', 'Open', 'todo')]), undefined);
  assert.equal(progressStatus([
    option('review', 'In review', 'in_progress'), option('work', 'In Progress', 'in_progress')
  ])?.id, 'work');
});
