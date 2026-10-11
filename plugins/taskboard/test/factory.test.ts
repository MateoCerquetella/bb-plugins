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
const { readReviewResult } = await import('../factory/review.ts');
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
  const threadStatuses = new Map<string, string>();
  let failSpawn = false;
  let failSend = false;
  let rejectSpawn = false;
  let rejectWorktree = false;
  let managed = true;
  let spawnInput: unknown;
  let currentThreadId = 'thr_native';
  const sent: { threadId: string; input: { text: string }[] }[] = [];
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
        const review = (input as { title: string }).title.endsWith(': review');
        currentThreadId = review ? `thr_review_${spawns}` : fork ? 'thr_build' : 'thr_native';
        return { id: currentThreadId, environmentId: fork ? 'env_build' : 'env_test', projectId: item.bbProjectId };
      },
      get: async ({ threadId }: { threadId: string }) => ({ id: threadId, status: threadStatuses.get(threadId) ?? threadStatus, projectId: item.bbProjectId, environmentId: threadId === 'thr_build' ? 'env_build' : 'env_test', providerId: 'codex' }),
      defaultExecutionOptions: async () => ({ model: 'test', permissionMode: 'accept-edits', reasoningLevel: 'medium', serviceTier: 'default' }),
      send: async (input: typeof sent[number]) => {
        sends++; sent.push(input); currentThreadId = input.threadId;
        if (failSend) throw new Error('Send response lost');
        return {};
      },
      events: { list: async (input: { threadId: string; limit?: string; order?: string; afterSeq?: string }) => {
        assert.ok(Number(input.limit) <= 100, 'Native event limit must not exceed 100');
        const matching = events.filter(event => event.threadId === input.threadId);
        return input.order === 'desc' ? matching.slice(-1) : matching.filter(event => event.seq > Number(input.afterSeq ?? 0));
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
    failSend: () => { failSend = true; },
    sends: () => sends, sent, progressWrites: () => progressWrites,
    threadStatus: (value: string, threadId?: string) => {
      if (threadId) threadStatuses.set(threadId, value); else threadStatus = value;
    },
    unmanaged: () => { managed = false; },
    failProgress: (value = true) => { failProgress = value; },
    complete: (body = 'Implementation plan and verification commands') => {
      output = body;
      events.push({
        id: String(events.length + 1), threadId: currentThreadId, seq: events.length + 1, createdAt: Date.now(),
        scope: { kind: 'turn', turnId: `turn_${events.length + 1}` }, type: 'turn/completed',
        data: { status: 'completed', providerThreadId: null }
      });
    },
    reject: (value = true) => { rejectSpawn = value; },
    rejectWorktree: () => { rejectWorktree = true; }
  };
}
test('diff resolves only a recorded path in the linked project workspace', async () => {
  const f = fixture();
  const record = newRecord(item);
  const run = startRun(record, 'investigate', false);
  run.threadId = 'thr_native'; run.environmentId = 'env_test';
  run.changedFiles = ['/repo/src/index.ts', '../outside.ts'];
  f.store.save(record);
  const requests: unknown[] = [];
  const sdk = {
    threads: { get: async () => ({ projectId: item.bbProjectId, environmentId: 'env_test' }) },
    environments: {
      get: async () => ({ projectId: item.bbProjectId, path: '/repo', mergeBaseBranch: 'main' }),
      diffPatch: async (input: unknown) => {
        requests.push(input);
        return { outcome: 'available', patches: [{ path: 'src/index.ts', patch: '@@ -1 +1 @@\n-old\n+new', truncated: false }] };
      }
    }
  } as unknown as Parameters<typeof createFactoryService>[0];
  const service = createFactoryService(sdk, f.store, () => {});
  assert.match((await service.diff(record, run.id, '/repo/src/index.ts')).patch!, /\+new/);
  assert.deepEqual(requests, [{
    environmentId: 'env_test', paths: ['src/index.ts'], target: { type: 'all', mergeBaseBranch: 'main' }
  }]);
  await assert.rejects(service.diff(record, run.id, 'unreported.ts'), /not part/);
  await assert.rejects(service.diff(record, 'unknown', '/repo/src/index.ts'), /not part/);
  await assert.rejects(service.diff(record, run.id, '../outside.ts'), /outside/);
  assert.equal(requests.length, 1);
  f.db.close();
});

test('diff reports unavailable workspaces and bounds large patches', async () => {
  const f = fixture();
  const record = newRecord(item);
  const run = startRun(record, 'investigate', false);
  run.changedFiles = ['file.ts'];
  f.store.save(record);
  assert.match((await f.service.diff(record, run.id, 'file.ts')).message!, /no available workspace/);
  const stored = f.store.get(record)!;
  stored.runs[0]!.threadId = 'thr_native'; stored.runs[0]!.environmentId = 'env_test'; f.store.save(stored);
  let outcome: unknown = { outcome: 'unavailable', failure: { message: 'Host offline' } };
  const sdk = {
    threads: { get: async () => ({ projectId: item.bbProjectId, environmentId: 'env_test' }) },
    environments: {
      get: async () => ({ projectId: item.bbProjectId, path: '/repo', mergeBaseBranch: null }),
      diffPatch: async () => outcome
    }
  } as unknown as Parameters<typeof createFactoryService>[0];
  const service = createFactoryService(sdk, f.store, () => {});
  assert.equal((await service.diff(record, run.id, 'file.ts')).message, 'Host offline');
  outcome = { outcome: 'available', patches: [{ path: 'file.ts', patch: 'x'.repeat(200_001), truncated: false }] };
  const bounded = await service.diff(record, run.id, 'file.ts');
  assert.equal(bounded.patch?.length, 200_000);
  assert.equal(bounded.truncated, true);
  f.db.close();
});

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
test('agent progress messages are bounded and survive store reload', () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    const run = startRun(record, 'investigate', false);
    for (let seq = 1; seq <= 15; seq++) {
      applyNativeEvent(run, {
        id: String(seq), threadId: 'thr_native', seq, createdAt: Date.now(),
        scope: { kind: 'turn', turnId: 'turn_1' }, type: 'item/completed',
        data: { item: { type: 'agentMessage', id: String(seq), text: `Update ${seq}` } }
      } as Parameters<typeof applyNativeEvent>[1]);
    }
    f.store.save(record);
    const saved = f.store.get(record)!;
    assert.equal(saved.runs[0].updates.length, 12);
    assert.equal(saved.runs[0].updates.at(-1)?.text, 'Update 15');
    assert.equal(saved.runs[0].status, 'starting');
  } finally { f.db.close(); }
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
test('missing host source recovers as retryable without automatic dispatch', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    record.automatic = true;
    const run = startRun(record, 'investigate', false);
    run.status = 'uncertain';
    run.error = 'Native dispatch outcome uncertain: HTTP 404: Project has no local-path source for host. Inspect recent BB threads; no automatic retry.';
    f.store.save(record);
    const repaired = await f.service.get(item);
    assert.equal(repaired.runs[0].status, 'failed');
    assert.match(repaired.runs[0].error ?? '', /Configure the project source/);
    await f.service.poll(new AbortController().signal);
    assert.equal(f.spawns(), 0);
    await f.service.startTask(item, null);
    assert.equal(f.spawns(), 1);
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

const blockedReview = '<taskboard-review>{"verdict":"blocked","findings":"The requested implementation is missing. Verify the worktree and revision, then implement the plan."}</taskboard-review>';
function seedReview(f: ReturnType<typeof fixture>, output = blockedReview, automatic = true) {
  const record = newRecord(item);
  savePlan(record, 'Implement current scope and run the relevant checks');
  approvePlan(record, record.plans[0].digest);
  record.automatic = automatic;
  record.trackerProgress = { status: 'synced', message: null };
  const build = startRun(record, 'build', false);
  build.status = 'finished'; build.threadId = 'thr_native'; build.environmentId = 'env_test';
  build.output = 'Implementation revision abc123 in branch fix/panel, workspace /work/panel';
  const review = startRun(record, 'review', false);
  review.status = 'finished'; review.threadId = 'thr_review_seed'; review.environmentId = 'env_test';
  review.output = output;
  return f.store.save(record);
}

test('review outcomes require a valid result; legacy negative verdicts are recoverable', () => {
  assert.equal(readReviewResult(blockedReview).verdict, 'blocked');
  assert.equal(readReviewResult('ROT-5 is not implemented in the inspected checkout.').verdict, 'blocked');
  assert.equal(readReviewResult('The checkout has none of the requested implementation.').verdict, 'blocked');
  assert.equal(readReviewResult('No blockers found; implementation is complete.').verdict, 'unknown');
  assert.equal(readReviewResult('<taskboard-review>{"verdict":"blocked","findings":""}</taskboard-review>').verdict, 'unknown');
  assert.equal(readReviewResult('<taskboard-review>broken JSON</taskboard-review>\nChanges requested').verdict, 'unknown');
  assert.equal(readReviewResult('<taskboard-review>{"verdict":"passed","findings":"Verified abc123"}</taskboard-review>').verdict, 'passed');
});

test('blocked review automatically resumes the same Build with findings exactly once', async () => {
  const f = fixture();
  try {
    const before = seedReview(f);
    const review = before.runs.at(-1)!;
    await Promise.all([f.service.get(item), f.service.get(item), f.service.poll(new AbortController().signal)]);
    const record = f.store.all()[0];
    const repair = record.runs.at(-1)!;
    assert.equal(record.stage, 'Build');
    assert.equal(repair.kind, 'build');
    assert.equal(repair.repairOf, review.id);
    assert.equal(repair.threadId, before.runs[0].threadId);
    assert.equal(repair.environmentId, before.runs[0].environmentId);
    assert.equal(repair.planDigest, before.approvedDigest);
    assert.equal(record.runs[1].reviewResult?.verdict, 'blocked');
    assert.equal(f.spawns(), 0);
    assert.equal(f.sends(), 1);
    assert.match(f.sent[0].input[0].text, /requested implementation is missing/);
    assert.match(f.sent[0].input[0].text, /same implementation worktree and revision/);
    assert.match(f.sent[0].input[0].text, /Keep the ticket In Progress/);
    assert.equal(f.progressWrites(), 0);
    await f.service.recover();
    await f.service.get(item);
    assert.equal(f.sends(), 1);
  } finally { f.db.close(); }
});

test('repair completion starts independent review of the repaired Build workspace', async () => {
  const f = fixture();
  try {
    seedReview(f);
    let record = await f.service.get(item);
    const buildThread = record.runs.at(-1)!.threadId;
    f.complete('Changed panel.ts; npm test passed. Revision def456, workspace /work/panel.\n<taskboard-build>{"verdict":"implemented","summary":"Verified panel.ts","revision":"def456"}</taskboard-build>');
    record = await f.service.get(item);
    assert.equal(record.stage, 'Review');
    assert.notEqual(record.runs.at(-1)!.threadId, buildThread);
    const input = f.spawnInput() as { environment: unknown; prompt: string };
    assert.deepEqual(input.environment, { type: 'reuse', environmentId: 'env_test' });
    assert.match(input.prompt, /Revision def456/);
    assert.match(input.prompt, /Authoring session: thr_native/);
    assert.match(input.prompt, /<taskboard-review>/);
    f.complete('<taskboard-review>{"verdict":"passed","findings":"Verified def456 and required checks"}</taskboard-review>');
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.reviewResult?.verdict, 'passed');
    assert.equal(record.stage, 'Review');
    assert.equal(f.sends(), 1);
    assert.equal(f.spawns(), 1);
    assert.equal(f.progressWrites(), 0);
  } finally { f.db.close(); }
});

test('review repair loop stops after two attempts without closing the tracker', async () => {
  const f = fixture();
  try {
    seedReview(f);
    await f.service.get(item);
    for (let attempt = 0; attempt < 2; attempt++) {
      f.complete(`<taskboard-build>{"verdict":"implemented","summary":"Repair ${attempt + 1} with revision and checks","revision":"def456"}</taskboard-build>`);
      await f.service.get(item);
      f.complete(blockedReview);
      await f.service.get(item);
    }
    const record = f.store.all()[0];
    assert.equal(record.stage, 'Review');
    assert.match(record.automationError!, /repair limit reached \(2 attempts\)/);
    assert.equal(f.sends(), 2);
    assert.equal(f.spawns(), 2);
    await f.service.startTask(item, null);
    assert.equal(f.sends(), 2);
    assert.equal(f.progressWrites(), 0);
  } finally { f.db.close(); }
});

test('manual and unknown reviews remain actionable without an automatic dispatch', async () => {
  for (const [output, automatic] of [[blockedReview, false], ['Could not establish a verdict.', true]] as const) {
    const f = fixture();
    try {
      seedReview(f, output, automatic);
      const record = await f.service.get(item);
      assert.equal(f.sends(), 0);
      const repaired = await f.service.start(item, {
        expectedVersion: record.version, kind: 'build', contextThreadId: null, retry: false
      });
      assert.equal(repaired.runs.at(-1)?.kind, 'build');
      assert.equal(repaired.automatic, true);
      assert.equal(f.sends(), 1);
    } finally { f.db.close(); }
  }
});

test('busy review completion waits for native idle without consuming a repair attempt', async () => {
  const f = fixture();
  try {
    seedReview(f);
    f.threadStatus('active', 'thr_review_seed');
    let record = await f.service.get(item);
    assert.equal(record.runs.length, 2);
    assert.equal(record.automationError, null);
    f.threadStatus('idle', 'thr_review_seed');
    record = await f.service.get(item);
    assert.equal(record.runs.length, 3);
    assert.equal(f.sends(), 1);
  } finally { f.db.close(); }
});

test('lost repair response is uncertain and cannot dispatch again after restart', async () => {
  const f = fixture();
  try {
    seedReview(f); f.failSend();
    let record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'uncertain');
    await f.service.recover();
    record = await f.service.startTask(item, null);
    await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'uncertain');
    assert.equal(f.sends(), 1);
  } finally { f.db.close(); }
});

test('review repairs reject scope changes and replacement workspaces', async () => {
  for (const change of ['scope', 'workspace'] as const) {
    const f = fixture();
    try {
      const record = seedReview(f);
      if (change === 'workspace') {
        record.runs[0].environmentId = 'env_other';
        f.store.save(record);
      }
      const result = await f.service.get(change === 'scope' ? { ...item, description: 'New scope' } : item);
      assert.equal(f.sends(), 0);
      assert.equal(f.spawns(), 0);
      assert.ok(result.automationError);
    } finally { f.db.close(); }
  }
});

test('resumed review turns invalidate the previous verdict', () => {
  const record = newRecord(item);
  const run = startRun(record, 'investigate', false);
  run.kind = 'review'; run.reviewResult = { verdict: 'blocked', findings: 'Old findings' };
  applyNativeEvent(run, {
    id: 'started', threadId: 'thr_review', seq: 1, createdAt: Date.now(),
    scope: { kind: 'turn', turnId: 'next-turn' }, type: 'turn/started', data: { providerThreadId: 'provider-next' }
  });
  assert.equal(run.reviewResult, null);
  assert.equal(run.output, '');
});

test('repair Build that needs input pauses without requesting another review', async () => {
  const f = fixture();
  try {
    seedReview(f);
    await f.service.get(item);
    f.complete('<taskboard-build>{"verdict":"needs_input","summary":"Choose the media retention policy before implementation.","revision":null}</taskboard-build>');
    const record = await f.service.get(item);
    assert.equal(record.stage, 'Build');
    assert.equal(record.runs.at(-1)?.buildResult?.verdict, 'needs_input');
    assert.match(record.automationError!, /Build needs input: Choose the media retention policy/);
    assert.equal(f.spawns(), 0);
    await assert.rejects(f.service.start(item, {
      expectedVersion: record.version, kind: 'review', contextThreadId: null, retry: false
    }), /unresolved blockers or needs input/);
  } finally { f.db.close(); }
});

test('Start task resumes a blocked Build in the same managed session exactly once', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    savePlan(record, 'Implement current scope and run the relevant checks');
    approvePlan(record, record.plans[0].digest);
    record.automatic = true;
    const blocked = startRun(record, 'build', false);
    blocked.status = 'finished';
    blocked.threadId = 'thr_native';
    blocked.environmentId = 'env_test';
    blocked.output = '<taskboard-build>{"verdict":"blocked","summary":"Finish the remaining media validation without bypassing required policy decisions.","revision":null}</taskboard-build>';
    blocked.buildResult = {
      verdict: 'blocked',
      summary: 'Finish the remaining media validation without bypassing required policy decisions.',
      revision: null
    };
    record.automationError = `Automatic work paused: Build found blockers: ${blocked.buildResult.summary}`;
    f.store.save(record);

    const [first, second] = await Promise.all([
      f.service.startTask(item, null),
      f.service.startTask(item, null)
    ]);
    const resumed = first.runs.at(-1)!;
    assert.equal(resumed.kind, 'build');
    assert.equal(resumed.status, 'running');
    assert.equal(resumed.threadId, blocked.threadId);
    assert.equal(resumed.environmentId, blocked.environmentId);
    assert.equal(resumed.continuationOf, blocked.id);
    assert.equal(resumed.repairOf, null);
    assert.equal(first.automationError, null);
    assert.equal(second.runs.at(-1)?.id, resumed.id);
    assert.equal(f.sends(), 1);
    assert.equal(f.spawns(), 0);
    assert.match(f.sent[0].input[0].text, /remaining media validation/);
    assert.match(f.sent[0].input[0].text, /Do not invent product or policy decisions/);
    assert.match(f.sent[0].input[0].text, /do not bypass any tracker, evidence, policy, or workflow gate/);
  } finally { f.db.close(); }
});

test('continued blocked Build starts review only after implementation evidence', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    savePlan(record, 'Implement current scope and run the relevant checks');
    approvePlan(record, record.plans[0].digest);
    const blocked = startRun(record, 'build', false);
    blocked.status = 'finished';
    blocked.threadId = 'thr_native';
    blocked.environmentId = 'env_test';
    blocked.output = '<taskboard-build>{"verdict":"blocked","summary":"Recoverable build step failed.","revision":null}</taskboard-build>';
    blocked.buildResult = { verdict: 'blocked', summary: 'Recoverable build step failed.', revision: null };
    f.store.save(record);
    await f.service.startTask(item, null);
    f.complete('<taskboard-build>{"verdict":"implemented","summary":"Implemented and verified the approved scope.","revision":"def456"}</taskboard-build>');
    const completed = await f.service.get(item);
    assert.equal(completed.runs.at(-1)?.kind, 'review');
    assert.equal(completed.runs.at(-1)?.environmentId, 'env_test');
    assert.equal(f.sends(), 1);
    assert.equal(f.spawns(), 1);
  } finally { f.db.close(); }
});

test('a native Build restart clears only its obsolete Build pause', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    savePlan(record, 'Implement current scope');
    approvePlan(record, record.plans[0].digest);
    const run = startRun(record, 'build', false);
    run.status = 'finished';
    run.threadId = 'thr_native';
    run.environmentId = 'env_test';
    run.buildResult = { verdict: 'blocked', summary: 'Old blocker', revision: null };
    record.automationError = 'Automatic work paused: Build found blockers: Old blocker';
    f.store.save(record);
    f.events.push({
      id: 'resumed', threadId: 'thr_native', seq: 1, createdAt: Date.now(),
      scope: { kind: 'turn', turnId: 'turn_resumed' }, type: 'turn/started',
      data: { providerThreadId: 'provider-thread-resumed' }
    } as Parameters<typeof applyNativeEvent>[1]);
    const resumed = await f.service.get(item);
    assert.equal(resumed.runs.at(-1)?.status, 'running');
    assert.equal(resumed.automationError, null);

    resumed.automationError = 'Issue scope changed. Automatic work paused; inspect the session and updated plan.';
    f.store.save(resumed);
    const preserved = await f.service.get(item);
    assert.match(preserved.automationError!, /Issue scope changed/);
  } finally { f.db.close(); }
});

test('legacy waiting Build and repaired turns without a revision cannot imply implementation', async () => {
  const f = fixture();
  try {
    seedReview(f);
    await f.service.get(item);
    f.complete('Implementation is awaiting two required decisions. No files were changed.');
    let record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.buildResult?.verdict, 'needs_input');
    assert.equal(f.spawns(), 0);
    const run = record.runs.at(-1)!;
    run.output = '<taskboard-build>{"verdict":"implemented","summary":"Turn ended","revision":null}</taskboard-build>';
    run.buildResult = null; record.automationError = null;
    f.store.save(record);
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.buildResult?.verdict, 'unknown');
    assert.match(record.automationError!, /did not report a verified implementation revision/);
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
