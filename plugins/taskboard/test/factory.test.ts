import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const { factoryCoordinatorSchema, factoryRecordSchema } = await import('../factory/contract.ts');
const { progressStatus } = await import('../factory/tracker.ts');
const { newRecord, savePlan, approvePlan, startRun } = await import('../factory/state.ts');
const { createFactoryStore } = await import('../factory/store.ts');
const { createFactoryService, applyNativeEvent, factoryPrompt } = await import('../factory/service.ts');
const { readReviewResult, readBuildResult, readableResultOutput } = await import('../factory/review.ts');
const { coordinatorTitle } = await import('../factory/coordinator.ts');
test('readable reports retain surrounding legacy details and malformed evidence', () => {
  assert.equal(readableResultOutput('## Checks\n680 tests passed.\n<taskboard-review>{"verdict":"blocked","findings":"Missing backfill."}</taskboard-review>\nNo deployment.'),
    '## Checks\n680 tests passed.\nMissing backfill.\nNo deployment.');
  assert.equal(readableResultOutput('<taskboard-review>invalid</taskboard-review>'),
    '<taskboard-review>invalid</taskboard-review>');
  assert.equal(readableResultOutput('::taskboard-result{kind="review" verdict="blocked"}\n## Blockers\nMissing backfill.'),
    '## Blockers\nMissing backfill.');
});
test('result directives preserve Markdown and require explicit implementation evidence', () => {
  assert.deepEqual(readReviewResult('::taskboard-result{kind="review" verdict="blocked"}\n\n## Blockers\n- Missing backfill.'),
    { verdict: 'blocked', findings: '## Blockers\n- Missing backfill.' });
  assert.deepEqual(readBuildResult('::taskboard-result{kind="build" verdict="implemented" revision="abc123"}\n\nTests passed.'),
    { verdict: 'implemented', summary: 'Tests passed.', revision: 'abc123' });
  assert.deepEqual(readBuildResult('::taskboard-result{kind="build" verdict="needs_input"}\nChoose retention policy.'),
    { verdict: 'needs_input', summary: 'Choose retention policy.', revision: null });
  assert.deepEqual(readReviewResult('::taskboard-result{kind="review" verdict="passed"}\nVerified the plan.'),
    { verdict: 'passed', findings: 'Verified the plan.' });
  for (const output of [
    '::taskboard-result{kind="build" verdict="implemented"}\nDone',
    '::taskboard-result{kind="review" verdict="blocked"}\n',
    '::taskboard-result{kind="review" verdict="passed" extra="yes"}\nDone',
    '```text\n::taskboard-result{kind="review" verdict="passed"}\n```\nDone',
    '::taskboard-result{kind="review" verdict="passed"}\n::taskboard-result{kind="review" verdict="blocked"}\nMissing',
    '::taskboard-result{kind="review" verdict="passed"}\n<taskboard-review>{"verdict":"blocked","findings":"Missing"}</taskboard-review>',
    '::taskboard-result{kind="review" verdict="passed" revision="abc"}\nDone'
  ]) {
    assert.equal(readBuildResult(output).verdict, 'unknown');
    assert.equal(readReviewResult(output).verdict, 'unknown');
  }
});
const item: WorkItem = {
  bbProjectId: 'proj_test', source: 'gitlab', locator: 'gitlab.com/group/repo#12',
  key: '#12', title: 'Keep panel open', description: 'Show progress.', url: 'https://gitlab.com/group/repo/-/issues/12',
  status: 'Open', stateCategory: 'todo', priority: null, assignee: null,
  project: null, labels: [], updatedAt: new Date().toISOString()
};
test('factory policy defaults disabled and durable admission is idempotent and capacity bounded', () => {
  const store = createFactoryStore(new Database(':memory:'));
  const initial = store.getProjectPolicy(item.bbProjectId, item.source);
  assert.equal(initial.enabled, false);
  const policy = store.saveProjectPolicy({ ...initial, enabled: true, maxConcurrent: 1 });
  const first = store.admit({
    projectId: item.bbProjectId, source: item.source, locator: item.locator,
    scopeDigest: 'scope-a'
  }, policy);
  assert.equal(first.kind, 'admitted');
  assert.equal(first.kind === 'admitted' && first.record.admission.kind, 'factory');
  const duplicate = store.admit({
    projectId: item.bbProjectId, source: item.source, locator: item.locator,
    scopeDigest: 'scope-a'
  }, policy);
  assert.equal(duplicate.kind, 'existing');
  const capacity = store.admit({
    projectId: item.bbProjectId, source: item.source, locator: 'second',
    scopeDigest: 'scope-b'
  }, policy);
  assert.equal(capacity.kind, 'capacity');
  assert.deepEqual(store.projectStatus(item.bbProjectId, item.source), {
    kind: 'paused', policy, active: 1
  });
});
test('two database connections preserve claims, capacity, and policy after reopen', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskboard-admission-'));
  const path = join(root, 'factory.sqlite');
  const a = new Database(path);
  const b = new Database(path);
  try {
    const first = createFactoryStore(a);
    const second = createFactoryStore(b);
    const policy = first.saveProjectPolicy({
      ...first.getProjectPolicy(item.bbProjectId, item.source), enabled: true
    });
    const identity = { projectId: item.bbProjectId, source: item.source, locator: item.locator, scopeDigest: 'scope' };
    assert.equal(first.admit(identity, policy).kind, 'admitted');
    assert.equal(second.admit(identity, policy).kind, 'existing');
    assert.equal(second.admit({ ...identity, locator: 'another' }, policy).kind, 'capacity');
    a.close();
    b.close();
    const reopened = new Database(path);
    try {
      const store = createFactoryStore(reopened);
      assert.equal(store.getProjectPolicy(item.bbProjectId, item.source).enabled, true);
      assert.equal(store.admit(identity, policy).kind, 'existing');
      assert.equal(store.all().length, 1);
    } finally { reopened.close(); }
  } finally {
    if (a.open) a.close();
    if (b.open) b.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('automatic scans revalidate tickets, suppress duplicate ticks, and stop stages when paused', async () => {
  let live = { ...item };
  const f = fixture({
    provider: () => item.source,
    candidates: async () => [item],
    liveItem: async () => live
  });
  const policy = f.store.saveProjectPolicy({
    ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true
  });
  live = { ...item, stateCategory: 'done' };
  await f.service.scan();
  assert.equal(f.spawns(), 0);
  live = { ...item };
  await Promise.all([f.service.scan(item.bbProjectId), f.service.scan(item.bbProjectId)]);
  assert.equal(f.spawns(), 1);
  assert.equal(f.store.all()[0]?.admission.kind, 'factory');
  f.complete();
  f.store.saveProjectPolicy({ ...policy, enabled: false });
  await f.service.poll(new AbortController().signal);
  assert.equal(f.spawns(), 1);
  assert.equal(f.store.all()[0]?.runs[0]?.status, 'finished');
});

test('automatic scans retain uncertain dispatch without spawning again', async () => {
  const f = fixture({
    provider: () => item.source, candidates: async () => [item], liveItem: async () => item
  });
  f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
  f.fail();
  await f.service.scan();
  await f.service.scan();
  await f.service.recover();
  await f.service.poll(new AbortController().signal);
  assert.equal(f.spawns(), 1);
  assert.equal(f.store.all()[0]?.runs[0]?.status, 'uncertain');
});

test('factory admission fails closed for stale, disabled, and wrong-provider policy', () => {
  const store = createFactoryStore(new Database(':memory:'));
  const disabled = store.getProjectPolicy(item.bbProjectId, item.source);
  assert.equal(store.admit({
    projectId: item.bbProjectId, source: item.source, locator: item.locator,
    scopeDigest: 'scope'
  }, disabled).kind, 'disabled');
  const enabled = store.saveProjectPolicy({ ...disabled, enabled: true });
  store.saveProjectPolicy({ ...enabled, enabled: false });
  assert.equal(store.admit({
    projectId: item.bbProjectId, source: item.source, locator: item.locator,
    scopeDigest: 'scope'
  }, enabled).kind, 'disabled');
  assert.equal(store.admit({
    projectId: item.bbProjectId, source: 'linear', locator: item.locator,
    scopeDigest: 'scope'
  }, enabled).kind, 'disabled');
});
function fixture(queue?: Parameters<typeof createFactoryService>[4]) {
  const db = new Database(':memory:');
  const store = createFactoryStore(db);
  let cachedItem: WorkItem | null = item;
  let spawns = 0;
  let coordinatorSpawns = 0;
  let coordinatorFailure: 'lost' | 'rejected' | null = null;
  let onCoordinatorSpawn = () => {};
  let sends = 0;
  let progressWrites = 0;
  let failProgress = false;
  let output = 'Observed repository findings';
  let threadStatus = 'idle';
  const threadStatuses = new Map<string, string>();
  const archived = new Set<string>();
  const deleted = new Set<string>();
  let unarchives = 0;
  let onUnarchive = () => {};
  let onExecutionOptions = () => {};
  let environmentStatus = 'ready';
  let failEnvironmentGet = false;
  let buildEnvironment = 'env_test';
  let failSpawn = false;
  let failSend = false;
  let rejectSpawn = false;
  let rejectWorktree = false;
  let managed = true;
  let spawnInput: unknown;
  let currentThreadId = 'thr_native';
  const spawnInputs: { title: string; parentThreadId?: string; environment: { type: string; environmentId?: string } }[] = [];
  const parents = new Map<string, string | null>();
  const titles = new Map<string, string>();
  const createdAt = new Map<string, number>();
  const threadEnvironments = new Map<string, string>([
    ['thr_native', 'env_test'], ['thr_build', 'env_build'], ['thr_review_seed', 'env_test']
  ]);
  const sent: { threadId: string; input: { text: string }[] }[] = [];
  const events: Parameters<typeof applyNativeEvent>[1][] = [];
  const sdk = {
    threads: {
      spawn: async (input: unknown) => {
        const request = input as typeof spawnInputs[number];
        spawnInputs.push(request);
        if (request.title.includes(': coordinator [')) {
          coordinatorSpawns++;
          if (coordinatorFailure === 'rejected') throw new Error('HTTP 400: hostId is required unless workspace.type is personal');
          const id = `thr_coordinator_${coordinatorSpawns}`;
          parents.set(id, null);
          titles.set(id, request.title);
          createdAt.set(id, Date.now());
          threadEnvironments.set(id, 'env_test');
          onCoordinatorSpawn();
          if (coordinatorFailure === 'lost') throw new Error('Coordinator response lost');
          return { id, environmentId: 'env_test', projectId: item.bbProjectId, status: 'idle' };
        }
        spawnInput = input;
        spawns++;
        if (rejectSpawn) throw new Error('HTTP 400: hostId is required unless workspace.type is personal');
        if (rejectWorktree) throw new Error('HTTP 409: This project checkout has no usable git branch.');
        if (failSpawn) throw new Error('Response lost');
        const kind = request.title.split(': ').at(-1);
        currentThreadId = kind === 'investigate' && spawns === 1 ? 'thr_native'
          : kind === 'build' ? 'thr_build'
          : `thr_${kind}_${spawns}`;
        const environmentId = request.environment.type === 'reuse'
          ? request.environment.environmentId!
          : request.environment.type === 'host' ? 'env_build' : 'env_test';
        threadEnvironments.set(currentThreadId, environmentId);
        parents.set(currentThreadId, request.parentThreadId ?? null);
        titles.set(currentThreadId, request.title);
        createdAt.set(currentThreadId, Date.now());
        return { id: currentThreadId, environmentId, projectId: item.bbProjectId };
      },
      get: async ({ threadId }: { threadId: string }) => ({
        id: threadId, status: threadStatuses.get(threadId) ?? threadStatus,
        projectId: item.bbProjectId,
        environmentId: threadId === 'thr_native' ? buildEnvironment : threadEnvironments.get(threadId) ?? 'env_test',
        providerId: 'codex', archivedAt: archived.has(threadId) ? 1 : null, deletedAt: deleted.has(threadId) ? 1 : null,
        parentThreadId: parents.get(threadId) ?? null,
        title: titles.get(threadId) ?? null, createdAt: createdAt.get(threadId) ?? Date.now()
      }),
      unarchive: async ({ threadId }: { threadId: string }) => {
        unarchives++;
        onUnarchive();
        archived.delete(threadId);
        return { ok: true };
      },
      defaultExecutionOptions: async () => {
        onExecutionOptions();
        return { model: 'test', permissionMode: 'accept-edits', reasoningLevel: 'medium', serviceTier: 'default' };
      },
      send: async (input: typeof sent[number]) => {
        sends++; sent.push(input); currentThreadId = input.threadId;
        if (failSend) throw new Error('Send response lost');
        return {};
      },
      events: { list: async (input: { threadId: string; limit?: string; order?: string; afterSeq?: string }) => {
        assert.ok(Number(input.limit) <= 100, 'Native event limit must not exceed 100');
        const matching = events.filter(event => event.threadId === input.threadId);
        return input.order === 'desc' ? matching.slice(-1)
          : matching.filter(event => event.seq > Number(input.afterSeq ?? 0)).slice(0, Number(input.limit ?? 100));
      } },
      output: async () => ({ output })
    },
    projects: { defaultExecutionOptions: async () => ({ model: 'test', providerId: 'codex' }) },
    environments: { get: async ({ environmentId }: { environmentId: string }) => {
      if (failEnvironmentGet) throw new Error('Workspace lookup temporarily unavailable');
      return {
        id: environmentId, managed: managed || environmentId === 'env_build',
        isWorktree: managed || environmentId === 'env_build', hostId: 'host_test',
        projectId: item.bbProjectId, status: environmentStatus, path: '/repo/worktree'
      };
    } }
  } as unknown as Parameters<typeof createFactoryService>[0];
  const service = createFactoryService(sdk, store, () => {}, {
    getItem: () => cachedItem,
    async markInProgress() {
      progressWrites++;
      if (failProgress) throw new Error('Provider permission denied');
      return { status: 'synced', message: null };
    }
  }, queue);
  return {
    db, store, service, sdk, events, spawns: () => spawns, spawnInput: () => spawnInput,
    coordinatorSpawns: () => coordinatorSpawns, spawnInputs, parents, titles, createdAt,
    coordinatorFailure: (value: typeof coordinatorFailure) => { coordinatorFailure = value; },
    onCoordinatorSpawn: (callback: () => void) => { onCoordinatorSpawn = callback; },
    cachedItem: (value: WorkItem | null) => { cachedItem = value; },
    archived, deleted, unarchives: () => unarchives,
    onUnarchive: (callback: () => void) => { onUnarchive = callback; },
    onExecutionOptions: (callback: () => void) => { onExecutionOptions = callback; },
    environmentStatus: (value: string) => { environmentStatus = value; },
    failEnvironmentGet: (value = true) => { failEnvironmentGet = value; },
    buildEnvironment: (value: string) => { buildEnvironment = value; },
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

test('historical records parse without a coordinator and coordinator states validate their payloads', () => {
  const { coordinator: omitted, ...historical } = newRecord(item);
  assert.equal(factoryRecordSchema.parse(historical).coordinator, null);
  assert.equal(omitted?.status, 'pending');
  const intent = { intentId: 'intent-1', startedAt: new Date().toISOString(), legacyRunCount: 0 };
  for (const value of [
    { status: 'pending' }, { status: 'starting', ...intent },
    { status: 'failed', ...intent, error: 'Rejected before dispatch' },
    { status: 'uncertain', ...intent, error: 'Response lost' },
    { status: 'ready', ...intent, threadId: 'thr_root', nativeStatus: 'idle', error: null }
  ]) {
    assert.deepEqual(factoryCoordinatorSchema.parse(JSON.parse(JSON.stringify(value))), value);
  }
  assert.equal(factoryCoordinatorSchema.safeParse({ status: 'ready', ...intent }).success, false);
  assert.equal(factoryCoordinatorSchema.safeParse({ status: 'uncertain', ...intent }).success, false);
});

test('concurrent starts create one coordinator and parent every new stage without changing worktrees', async () => {
  const f = fixture();
  try {
    const [first, duplicate] = await Promise.all([f.service.startTask(item, null), f.service.startTask(item, null)]);
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.spawns(), 1);
    assert.deepEqual(first.coordinator, duplicate.coordinator);
    assert.equal(first.coordinator?.status, 'ready');
    if (first.coordinator?.status !== 'ready') throw new Error('Expected coordinator');
    const root = first.coordinator.threadId;
    assert.equal(f.store.forThread(root)?.locator, item.locator);
    assert.equal(f.store.forThread(first.runs[0].threadId!)?.locator, item.locator);
    f.complete('Investigation findings');
    await f.service.get(item);
    f.complete('Approved implementation plan');
    await f.service.get(item);
    const build = f.store.all()[0].runs.at(-1)!;
    f.complete('::taskboard-result{kind="build" verdict="implemented" revision="abc123"}\nVerified implementation.');
    const review = await f.service.get(item);
    assert.deepEqual(f.spawnInputs.filter(input => input.parentThreadId).map(input => input.parentThreadId),
      [root, root, root, root]);
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(build.environmentId, 'env_build');
    assert.equal(review.runs.at(-1)?.environmentId, 'env_build');
    assert.equal(review.stage, 'Review');
  } finally { f.db.close(); }
});

test('lost coordinator response blocks workers and provider writes across restart until exact recovery', async () => {
  const f = fixture({ provider: () => item.source, candidates: async () => [item], liveItem: async () => item });
  try {
    f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
    f.coordinatorFailure('lost');
    await f.service.scan(item.bbProjectId);
    let record = f.store.all()[0];
    assert.equal(record.coordinator?.status, 'uncertain');
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.spawns(), 0);
    assert.equal(f.progressWrites(), 0);
    const restarted = createFactoryService(f.sdk, f.store, () => {}, undefined, {
      provider: () => item.source, candidates: async () => [item], liveItem: async () => item
    });
    await restarted.recover();
    await restarted.poll(new AbortController().signal);
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.spawns(), 0);
    if (record.coordinator?.status !== 'uncertain') throw new Error('Expected ambiguous coordinator');
    await assert.rejects(restarted.recoverCoordinator(item, record.version, 'wrong-intent', 'thr_coordinator_1'), /current uncertain/);
    f.titles.set('thr_coordinator_1', 'Unrelated conversation');
    await assert.rejects(restarted.recoverCoordinator(item, record.version, record.coordinator.intentId, 'thr_coordinator_1'), /matching this ticket/);
    f.titles.set('thr_coordinator_1', coordinatorTitle(item, record.coordinator.intentId));
    const recovered = await restarted.recoverCoordinator(item, record.version, record.coordinator.intentId, 'thr_coordinator_1');
    assert.equal(recovered.coordinator?.status, 'ready');
    await restarted.poll(new AbortController().signal);
    record = f.store.all()[0];
    assert.equal(record.runs[0].status, 'running');
    assert.equal(f.parents.get(record.runs[0].threadId!), 'thr_coordinator_1');
    assert.equal(f.coordinatorSpawns(), 1);
  } finally { f.db.close(); }
});

test('a persisted coordinator starting intent becomes uncertain without another native dispatch', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    record.coordinator = { status: 'starting', intentId: 'interrupted', startedAt: new Date().toISOString(), legacyRunCount: 0 };
    f.store.save(record);
    await f.service.recover();
    const observed = await f.service.startTask(item, null);
    assert.equal(observed.coordinator?.status, 'uncertain');
    assert.equal(f.coordinatorSpawns(), 0);
    assert.equal(f.spawns(), 0);
  } finally { f.db.close(); }
});

test('confirmed coordinator rejection requires explicit intent-bound retry', async () => {
  const f = fixture();
  try {
    f.coordinatorFailure('rejected');
    const rejected = await f.service.startTask(item, null);
    assert.equal(rejected.coordinator?.status, 'failed');
    assert.equal(f.spawns(), 0);
    await f.service.startTask(item, null);
    assert.equal(f.coordinatorSpawns(), 1);
    if (rejected.coordinator?.status !== 'failed') throw new Error('Expected confirmed rejection');
    f.coordinatorFailure(null);
    const current = f.store.all()[0];
    const retried = await f.service.retryCoordinator(item, current.version, rejected.coordinator.intentId);
    assert.equal(retried.coordinator?.status, 'ready');
    await f.service.startTask(item, null);
    assert.equal(f.coordinatorSpawns(), 2);
    assert.equal(f.spawns(), 1);
  } finally { f.db.close(); }
});

test('unavailable coordinator blocks new stages while existing worker completion remains observed', async () => {
  const f = fixture();
  try {
    const started = await f.service.startTask(item, null);
    if (started.coordinator?.status !== 'ready') throw new Error('Expected coordinator');
    f.archived.add(started.coordinator.threadId);
    f.complete('Investigation findings');
    const observed = await f.service.get(item);
    assert.equal(observed.runs[0].status, 'finished');
    assert.equal(observed.coordinator?.status, 'ready');
    assert.equal(f.spawns(), 1);
    assert.match(observed.automationError ?? '', /coordinator is archived or deleted/);
    f.archived.delete(started.coordinator.threadId);
    await f.service.startTask(item, null);
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.spawns(), 2);
  } finally { f.db.close(); }
});

test('external worker parent changes block further grouped dispatch', async () => {
  const f = fixture();
  try {
    const started = await f.service.startTask(item, null);
    f.parents.set(started.runs[0].threadId!, 'thr_unrelated');
    f.complete('Investigation findings');
    const observed = await f.service.get(item);
    assert.match(observed.runs[0].error ?? '', /different coordinator/);
    assert.equal(f.spawns(), 1);
    assert.equal(f.coordinatorSpawns(), 1);
  } finally { f.db.close(); }
});

test('legacy reads and explicit repeatable adoption preserve historical thread parents and evidence', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    record.coordinator = null;
    const run = startRun(record, 'investigate', false);
    run.status = 'finished'; run.threadId = 'thr_native'; run.environmentId = 'env_test';
    run.output = 'Historical investigation';
    f.parents.set('thr_native', 'thr_historical_parent');
    const saved = f.store.save(record);
    const observed = await f.service.get(item);
    assert.equal(f.coordinatorSpawns(), 0);
    const adopted = await f.service.adoptCoordinator(item, observed.version);
    assert.equal(adopted.coordinator?.status, 'ready');
    assert.equal(adopted.runs[0].output, 'Historical investigation');
    assert.equal(f.parents.get('thr_native'), 'thr_historical_parent');
    await f.service.adoptCoordinator(item, saved.version);
    assert.equal(f.coordinatorSpawns(), 1);
    await f.service.start(item, { expectedVersion: adopted.version, kind: 'plan', contextThreadId: null, retry: false });
    const latest = f.store.all()[0];
    assert.equal(latest.coordinator?.status, 'ready');
    assert.equal(latest.coordinator?.status === 'ready' && latest.coordinator.legacyRunCount, 1);
    assert.equal(f.parents.get(latest.runs.at(-1)!.threadId!), 'thr_coordinator_1');
  } finally { f.db.close(); }
});

test('only the winning coordinator intent owner may spawn across two SQLite service connections', async () => {
  const root = mkdtempSync(join(tmpdir(), 'taskboard-coordinator-race-'));
  const path = join(root, 'factory.sqlite');
  const dbA = new Database(path);
  const dbB = new Database(path);
  const f = fixture();
  try {
    const storeA = createFactoryStore(dbA);
    const storeB = createFactoryStore(dbB);
    const serviceA = createFactoryService(f.sdk, storeA, () => {});
    const serviceB = createFactoryService(f.sdk, storeB, () => {});
    const input = { expectedVersion: 0, kind: 'investigate' as const, contextThreadId: null, retry: false };
    await Promise.all([serviceA.start(item, input), serviceB.start(item, input)]);
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.spawns(), 1);
    assert.equal(storeA.all().length, 1);
    const saved = storeB.all()[0];
    assert.equal(saved.coordinator?.status, 'ready');
    if (saved.coordinator?.status !== 'ready') throw new Error('Expected coordinator');
    assert.equal(storeB.forThread(saved.coordinator.threadId)?.locator, item.locator);
    assert.equal(storeB.forThread(saved.runs[0].threadId!)?.locator, item.locator);
    dbA.close(); dbB.close();
    const reopened = new Database(path);
    try {
      const store = createFactoryStore(reopened);
      assert.equal(store.forThread(saved.coordinator.threadId)?.locator, item.locator);
      assert.equal(store.forThread(saved.runs[0].threadId!)?.locator, item.locator);
    } finally { reopened.close(); }
  } finally {
    if (dbA.open) dbA.close();
    if (dbB.open) dbB.close();
    f.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a post-spawn coordinator save failure leaves only a recoverable starting intent', async () => {
  const f = fixture();
  const save = f.store.save.bind(f.store);
  try {
    f.store.save = record => {
      if (record.coordinator?.status === 'ready') throw new Error('Storage write failed');
      return save(record);
    };
    await assert.rejects(f.service.startTask(item, null), /Storage write failed/);
    assert.equal(f.store.all()[0].coordinator?.status, 'starting');
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.spawns(), 0);
    f.store.save = save;
    await f.service.recover();
    const record = f.store.all()[0];
    assert.equal(record.coordinator?.status, 'uncertain');
    await f.service.startTask(item, null);
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.spawns(), 0);
  } finally { f.db.close(); }
});

test('coordinator ownership conflicts roll back both document and thread-index writes', () => {
  const f = fixture();
  try {
    const first = newRecord(item);
    first.coordinator = {
      status: 'ready', intentId: 'first', startedAt: new Date().toISOString(),
      legacyRunCount: 0, threadId: 'thr_owned_root', nativeStatus: 'idle', error: null
    };
    const saved = f.store.save(first);
    const second = newRecord({ ...item, locator: 'another-ticket' });
    second.coordinator = { ...first.coordinator, intentId: 'second' };
    const worker = startRun(second, 'investigate', false);
    worker.threadId = 'thr_new_worker';
    assert.throws(() => f.store.save(second), /Thread belongs to another/);
    assert.equal(f.store.get(second), null);
    assert.equal(f.store.forThread('thr_new_worker'), null);
    assert.equal(f.store.forThread('thr_owned_root')?.locator, item.locator);
    assert.throws(() => f.store.save(first), /Progress changed/);
    assert.equal(f.store.get(saved)?.version, saved.version);
  } finally { f.db.close(); }
});

test('coordinator initialization outcomes do not complete stages or release workflow capacity', async () => {
  for (const nativeStatus of ['idle', 'error'] as const) {
    const f = fixture({ provider: () => item.source, candidates: async () => [item], liveItem: async () => item });
    try {
      f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
      await f.service.scan(item.bbProjectId);
      const record = f.store.all()[0];
      if (record.coordinator?.status !== 'ready') throw new Error('Expected coordinator');
      f.threadStatus(nativeStatus, record.coordinator.threadId);
      const observed = await f.service.get(item);
      assert.equal(observed.runs[0].status, 'running');
      assert.equal(observed.stage, 'Triage');
      assert.equal(f.store.projectStatus(item.bbProjectId, item.source).kind, 'running');
      const status = f.store.projectStatus(item.bbProjectId, item.source);
      assert.equal('active' in status && status.active, 1);
      assert.equal(f.spawns(), 1);
      assert.equal(f.coordinatorSpawns(), 1);
    } finally { f.db.close(); }
  }
});

test('claimed tickets before the bounded scan window do not starve a later eligible ticket', async () => {
  const candidates = Array.from({ length: 501 }, (_, index) => ({ ...item, locator: `ticket-${index}` }));
  const liveReads: string[] = [];
  const f = fixture({
    provider: () => item.source, candidates: async () => candidates,
    liveItem: async identity => {
      liveReads.push(identity.locator);
      return candidates.find(candidate => candidate.locator === identity.locator)!;
    }
  });
  try {
    f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
    for (const candidate of candidates.slice(0, 500)) {
      const record = newRecord(candidate);
      record.admission = { kind: 'factory', claimedAt: new Date().toISOString() };
      record.stage = 'Done';
      f.store.save(record);
    }
    await f.service.scan(item.bbProjectId);
    assert.deepEqual(liveReads, ['ticket-500', 'ticket-500']);
    assert.equal(f.spawns(), 1);
    assert.equal(f.coordinatorSpawns(), 1);
    assert.equal(f.store.all().find(record => record.locator === 'ticket-500')?.runs[0].status, 'running');
  } finally { f.db.close(); }
});

test('healthy scans preserve queue-owned coordinator, stage, and automation blockers in project status', async () => {
  for (const blocker of ['coordinator', 'stage', 'automation'] as const) {
    const f = fixture({ provider: () => item.source, candidates: async () => [], liveItem: async () => item });
    try {
      f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
      const record = newRecord(item);
      record.admission = { kind: 'factory', claimedAt: new Date().toISOString() };
      if (blocker === 'coordinator') record.coordinator = {
        status: 'uncertain', intentId: 'lost-root', startedAt: new Date().toISOString(),
        legacyRunCount: 0, error: 'Coordinator response lost; link the original native thread.'
      };
      if (blocker === 'stage') {
        const run = startRun(record, 'investigate', false);
        run.status = 'uncertain'; run.error = 'Stage response lost; inspect native session.';
      }
      if (blocker === 'automation') record.automationError = 'Issue scope changed; inspect the updated ticket.';
      f.store.save(record);
      await f.service.scan(item.bbProjectId);
      assert.equal(f.store.getScan(item.bbProjectId)?.kind, 'success');
      const status = f.store.projectStatus(item.bbProjectId, item.source);
      assert.equal(status.kind, 'blocked');
      assert.match(status.kind === 'blocked' ? status.reason : '', new RegExp(blocker === 'automation' ? 'scope changed' : 'response lost'));
      assert.equal(f.spawns(), 0);
      assert.equal(f.coordinatorSpawns(), 0);
    } finally { f.db.close(); }
  }
});

test('pausing or changing live eligibility during coordinator creation prevents the first worker', async () => {
  for (const change of ['pause', 'closed', 'scope'] as const) {
    let live = { ...item };
    const f = fixture({ provider: () => item.source, candidates: async () => [item], liveItem: async () => live });
    try {
      const policy = f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
      f.onCoordinatorSpawn(() => {
        if (change === 'pause') f.store.saveProjectPolicy({ ...policy, enabled: false });
        else live = change === 'closed' ? { ...item, stateCategory: 'done' } : { ...item, description: 'Changed scope' };
      });
      await f.service.scan(item.bbProjectId);
      assert.equal(f.coordinatorSpawns(), 1);
      assert.equal(f.spawns(), 0);
      assert.equal(f.progressWrites(), 0);
      assert.equal(f.store.all()[0].coordinator?.status, 'ready');
      assert.equal(f.store.all()[0].runs.length, 0);
    } finally { f.db.close(); }
  }
});

test('background intake is throttled while explicit scans and native observations remain immediate', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let scans = 0;
  const f = fixture({
    provider: () => item.source,
    candidates: async () => { scans++; return [item]; },
    liveItem: async () => item
  });
  try {
    f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
    await f.service.scan();
    assert.equal(f.store.all()[0].runs[0].status, 'running');
    f.complete('Investigation findings');
    t.mock.timers.tick(2500);
    await f.service.scan();
    await f.service.poll(new AbortController().signal);
    assert.equal(scans, 1);
    assert.equal(f.store.all()[0].runs.at(-1)?.kind, 'plan');
    await f.service.scan(item.bbProjectId);
    assert.equal(scans, 2);
    t.mock.timers.tick(29_999);
    await f.service.scan();
    assert.equal(scans, 2);
    t.mock.timers.tick(1);
    await f.service.scan();
    assert.equal(scans, 3);
    assert.equal(f.store.getScan(item.bbProjectId)?.kind, 'success');
  } finally { f.db.close(); }
});

test('running and accepted-review observations do not re-read the provider or mutate scope from cache', async () => {
  let reads = 0;
  const f = fixture({
    provider: () => item.source, candidates: async () => [item],
    liveItem: async () => { reads++; return item; }
  });
  try {
    f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
    await f.service.scan();
    const admitted = f.store.all()[0];
    const observed = await f.service.get({ ...item, description: 'Outdated cached scope' });
    f.cachedItem(null);
    await f.service.poll(new AbortController().signal);
    assert.equal(observed.scopeDigest, admitted.scopeDigest);
    assert.equal(observed.automatic, true);
    assert.equal(observed.automationError, null);
    assert.equal(reads, 2);
    const record = f.store.all()[0];
    Object.assign(record.runs[0], {
      kind: 'review', status: 'finished',
      output: '::taskboard-result{kind="review" verdict="passed"}\nVerified revision abc123',
      reviewResult: { verdict: 'passed', findings: 'Verified revision abc123' }
    });
    f.store.save(record);
    await f.service.get(item);
    await f.service.poll(new AbortController().signal);
    assert.equal(reads, 2);
    assert.equal(f.store.all()[0].runs.at(-1)?.reviewResult?.verdict, 'passed');
  } finally { f.db.close(); }
});

test('factory polling revalidates uncached reservations and completed stages against the live provider', async () => {
  for (const stage of ['reserved', 'completed'] as const) {
    for (const outcome of ['open', 'closed', 'missing'] as const) {
      let live: WorkItem | null = item;
      const f = fixture({
        provider: () => item.source, candidates: async () => [item],
        liveItem: async () => {
          if (!live) throw new Error('Issue not found');
          return live;
        }
      });
      try {
        const policy = f.store.saveProjectPolicy({
          ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true
        });
        if (stage === 'reserved') f.store.admit(newRecord(item), policy);
        else {
          await f.service.scan();
          f.complete('Investigation findings');
        }
        f.cachedItem(null);
        if (outcome === 'closed') live = { ...item, stateCategory: 'done' };
        if (outcome === 'missing') live = null;
        await f.service.poll(new AbortController().signal);
        const record = f.store.all()[0];
        if (outcome === 'open') {
          assert.equal(record.runs.at(-1)?.kind, stage === 'reserved' ? 'investigate' : 'plan');
          assert.equal(record.runs.at(-1)?.status, 'running');
          assert.equal(record.automationError, null);
        } else {
          assert.equal(record.runs.length, stage === 'reserved' ? 0 : 1);
          if (stage === 'completed') assert.equal(record.runs[0].status, 'finished');
          assert.match(record.automationError ?? '', outcome === 'missing' ? /Issue not found/ : /changed/);
          assert.equal(f.spawns(), stage === 'reserved' ? 0 : 1);
        }
      } finally { f.db.close(); }
    }
  }
});

test('uncached manual records still observe completion without advancing', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    f.cachedItem(null);
    f.complete('Investigation findings');
    await f.service.poll(new AbortController().signal);
    const record = f.store.all()[0];
    assert.equal(record.admission.kind, 'manual');
    assert.equal(record.runs.length, 1);
    assert.equal(record.runs[0].status, 'finished');
    assert.equal(record.automationError, null);
    assert.equal(f.spawns(), 1);
  } finally { f.db.close(); }
});

test('factory stage advancement blocks live closure, scope drift, identity drift, and provider failures', async () => {
  for (const change of ['closed', 'scope', 'identity', 'unavailable'] as const) {
    let live: WorkItem = item;
    let unavailable = false;
    const f = fixture({
      provider: () => item.source, candidates: async () => [item],
      liveItem: async () => {
        if (unavailable) throw new Error('Provider unavailable');
        return live;
      }
    });
    try {
      f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true });
      await f.service.scan();
      const originalScope = f.store.all()[0].scopeDigest;
      if (change === 'closed') live = { ...item, stateCategory: 'done' };
      if (change === 'scope') live = { ...item, description: 'Changed live scope' };
      if (change === 'identity') live = { ...item, locator: 'another-ticket' };
      if (change === 'unavailable') unavailable = true;
      f.complete('Investigation findings');
      const record = await f.service.get(item);
      assert.equal(record.runs.at(-1)?.kind, 'investigate');
      assert.equal(record.runs.at(-1)?.status, 'finished');
      assert.equal(record.scopeDigest, originalScope);
      assert.match(record.automationError ?? '', /Automatic work paused:/);
      assert.equal(f.spawns(), 1);
    } finally { f.db.close(); }
  }
});

test('one unavailable provider does not stop another project scan or native completion observation', async () => {
  const f = fixture({
    provider: () => item.source,
    candidates: async policy => {
      if (policy.projectId === 'proj_aaa_unavailable') throw new Error('Provider unavailable');
      return [item];
    },
    liveItem: async () => item
  });
  try {
    for (const projectId of ['proj_aaa_unavailable', item.bbProjectId]) {
      f.store.saveProjectPolicy({ ...f.store.getProjectPolicy(projectId, item.source), enabled: true });
    }
    await f.service.scan();
    assert.equal(f.store.getScan('proj_aaa_unavailable')?.kind, 'blocked');
    assert.equal(f.store.getScan(item.bbProjectId)?.kind, 'success');
    assert.equal(f.store.all()[0].runs[0].status, 'running');
    f.complete('Investigation findings');
    await f.service.poll(new AbortController().signal);
    assert.equal(f.store.all()[0].runs.at(-1)?.kind, 'plan');
  } finally { f.db.close(); }
});

test('reserved-claim recovery validates all identity fields before dispatch', async () => {
  for (const live of [
    { ...item, bbProjectId: 'proj_other' },
    { ...item, source: 'linear' as const },
    { ...item, locator: 'another-ticket' }
  ]) {
    const f = fixture({
      provider: () => item.source, candidates: async () => [], liveItem: async () => live
    });
    try {
      const policy = f.store.saveProjectPolicy({
        ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true
      });
      const record = newRecord(item);
      f.store.admit({ ...record }, policy);
      await f.service.poll(new AbortController().signal);
      assert.equal(f.spawns(), 0);
      assert.equal(f.store.all()[0].runs.length, 0);
      assert.equal(f.store.all()[0].automationError, 'Reserved issue changed before dispatch.');
    } finally { f.db.close(); }
  }
});

test('automatic repairs honor a pause during preflight while explicit continuations still run', async () => {
  for (const kind of ['review', 'build'] as const) {
    const f = fixture({
      provider: () => item.source, candidates: async () => [], liveItem: async () => item
    });
    try {
      const policy = f.store.saveProjectPolicy({
        ...f.store.getProjectPolicy(item.bbProjectId, item.source), enabled: true
      });
      const record = newRecord(item);
      savePlan(record, 'Implement current scope and run the relevant checks');
      approvePlan(record, record.plans[0].digest);
      record.automatic = true;
      record.trackerProgress = { status: 'synced', message: null };
      const build = startRun(record, 'build', false);
      Object.assign(build, {
        status: 'finished', threadId: 'thr_native', environmentId: 'env_test',
        output: '::taskboard-result{kind="build" verdict="implemented" revision="abc123"}\nImplemented.',
        buildResult: { verdict: 'implemented', summary: 'Implemented.', revision: 'abc123' }
      });
      if (kind === 'review') {
        const review = startRun(record, 'review', false);
        Object.assign(review, {
          status: 'finished', threadId: 'thr_review_seed', environmentId: 'env_test',
          output: '::taskboard-result{kind="review" verdict="blocked"}\nFix the review finding.',
          reviewResult: { verdict: 'blocked', findings: 'Fix the review finding.' }
        });
      }
      record.admission = { kind: 'factory', claimedAt: new Date().toISOString() };
      if (kind === 'build') {
        record.runs[0].output = '::taskboard-result{kind="build" verdict="blocked"}\nFinish verification.';
        record.runs[0].buildResult = readBuildResult(record.runs[0].output);
      }
      f.store.save(record);
      f.onExecutionOptions(() => { f.store.saveProjectPolicy({ ...policy, enabled: false }); });
      const paused = await f.service.get(item);
      assert.equal(paused.runs.length, record.runs.length);
      assert.equal(paused.runs.at(-1)?.status, 'finished');
      assert.equal(f.sends(), 0);
      const resumed = await f.service.startTask(item, null);
      assert.equal(resumed.runs.length, record.runs.length + 1);
      assert.equal(resumed.runs.at(-1)?.status, 'running');
      assert.equal(f.sends(), 1);
    } finally { f.db.close(); }
  }
});
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
test('recovered native dispatch persists even when workspace lookup fails', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    const run = startRun(record, 'investigate', false);
    run.status = 'uncertain';
    run.threadId = 'thr_native';
    run.error = 'Native dispatch outcome uncertain';
    const saved = f.store.save(record);
    f.failEnvironmentGet();
    const recovered = await f.service.linkRecovered(item, saved.version, 'thr_native');
    assert.equal(recovered.runs[0]?.threadId, 'thr_native');
    assert.equal(recovered.runs[0]?.status, 'running');
    assert.equal(f.store.get(saved)?.runs[0]?.status, 'running');
    assert.equal(f.spawns(), 0);
    f.failEnvironmentGet(false);
    await f.service.get(item);
    assert.equal(f.store.get(saved)?.runs[0]?.hostId, 'host_test');
    assert.equal(f.store.get(saved)?.runs[0]?.checkoutRoot, '/repo/worktree');
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
test('Empirical observations survive reopen and older responses cannot replace them', () => {
  const f = fixture();
  try {
    const identity = newRecord(item);
    const snapshot = {
      hostId: 'host_a', environmentId: 'env_a', checkoutRoot: '/repo/worktree',
      observedAt: 200,
      status: { kind: 'feature', feature: 'task-1', revision: 4, phase: 'verify',
        status: 'waiting', nextAction: 'Run checks', verification: 'pending',
        completionLevel: 'implemented', completionMethod: null }
    } as const;
    f.store.saveEmpirical(identity, snapshot);
    f.store.saveEmpirical(identity, { ...snapshot, observedAt: 100,
      status: { ...snapshot.status, revision: 3 } });
    const reopened = createFactoryStore(f.db);
    assert.deepEqual(reopened.getEmpirical(identity), snapshot);
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
test('native polling drains every event page before advancing', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    for (let seq = 1; seq <= 100; seq++) f.events.push({
      id: `update-${seq}`, threadId: 'thr_native', seq, createdAt: Date.now(),
      scope: { kind: 'turn', turnId: 'turn_1' }, type: 'item/completed',
      data: { item: { type: 'agentMessage', id: `message-${seq}`, text: `Update ${seq}` } }
    } as Parameters<typeof applyNativeEvent>[1]);
    f.events.push({
      id: 'completed-101', threadId: 'thr_native', seq: 101, createdAt: Date.now(),
      scope: { kind: 'turn', turnId: 'turn_1' }, type: 'turn/completed',
      data: { status: 'completed', providerThreadId: null }
    });
    const record = await f.service.get(item);
    assert.equal(record.runs[0].cursor, 101);
    assert.equal(record.runs[0].status, 'finished');
    assert.equal(record.runs.at(-1)?.kind, 'plan');
  } finally { f.db.close(); }
});

test('resumed native activity clears stale results before automatic advancement', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    f.complete('Old investigation findings');
    let record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.kind, 'plan');
    const plan = record.runs.at(-1)!;
    plan.status = 'finished';
    plan.finishedAt = new Date().toISOString();
    plan.output = 'Stale plan';
    f.store.save(record);
    f.threadStatus('active', plan.threadId!);
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'running');
    assert.equal(record.runs.at(-1)?.output, '');
    assert.equal(record.runs.at(-1)?.finishedAt, null);
    assert.equal(record.runs.length, 2);
    f.events.push({
      id: 'resumed-plan', threadId: plan.threadId!, seq: plan.cursor + 1, createdAt: Date.now(),
      scope: { kind: 'turn', turnId: 'resumed-turn' }, type: 'turn/started',
      data: { providerThreadId: 'provider-resumed' }
    });
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'running');
    assert.equal(record.runs.at(-1)?.output, '');
    assert.equal(record.runs.at(-1)?.finishedAt, null);
    assert.equal(record.runs.length, 2);
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

test('Start task hands four stages to fresh sessions and preserves the exact approved plan', async () => {
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
    assert.notEqual(record.runs[0].threadId, record.runs[1].threadId);
    assert.equal(f.sends(), 0);
    f.complete('Implement current scope and run npm test');
    await Promise.all([f.service.get(item), f.service.get(item), f.service.startTask(item, null)]);
    record = f.store.all()[0];
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(record.runs.at(-1)?.planDigest, record.plans[0].digest);
    assert.equal(record.approvedDigest, record.plans[0].digest);
    assert.equal(record.plans[0].body, 'Implement current scope and run npm test');
    assert.equal(f.sends(), 0);
    assert.equal(f.spawns(), 3);
    assert.equal(new Set(record.runs.map(run => run.threadId)).size, 3);
    const buildInput = f.spawnInput() as { originKind?: string; sourceThreadId?: string; prompt: string };
    assert.equal(buildInput.originKind, undefined);
    assert.equal(buildInput.sourceThreadId, undefined);
    assert.match(buildInput.prompt, /Implement current scope and run npm test/);
    f.complete('::taskboard-result{kind="build" verdict="implemented" revision="abc123"}\nImplemented and tested');
    record = await f.service.get(item);
    assert.equal(record.stage, 'Review');
    assert.equal(record.runs.at(-1)?.kind, 'review');
    assert.equal(new Set(record.runs.map(run => run.threadId)).size, 4);
    assert.equal(f.spawns(), 4);
    assert.equal(f.sends(), 0);
    assert.equal(f.progressWrites(), 1);
  } finally { f.db.close(); }
});

test('completion before native idle continues automatically on the next poll', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    f.threadStatus('active', 'thr_native');
    f.complete('Investigation findings');
    let record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'running');
    assert.ok(record.runs.at(-1)?.finishedAt);
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'running');
    assert.ok(record.runs.at(-1)?.finishedAt);
    assert.equal(record.automationError, null);
    assert.equal(f.sends(), 0);
    f.threadStatus('idle', 'thr_native');
    await f.service.poll(new AbortController().signal);
    record = f.store.all()[0];
    assert.equal(record.runs.at(-1)?.kind, 'plan');
    const planThread = record.runs.at(-1)!.threadId!;
    f.threadStatus('active', planThread);
    f.complete('Plan with verification');
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'running');
    assert.equal(record.automationError, null);
    assert.equal(f.sends(), 0);
    f.threadStatus('idle', planThread);
    await f.service.poll(new AbortController().signal);
    record = f.store.all()[0];
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(f.sends(), 0);
    assert.equal(f.spawns(), 3);
  } finally { f.db.close(); }
});

for (const outcome of ['failed', 'interrupted', 'system-interrupted'] as const) {
  test(`${outcome} survives active and stopping polls until native idle`, async () => {
    const f = fixture();
    try {
      await f.service.startTask(item, null);
      const createdAt = Date.now();
      const scope = { kind: 'turn' as const, turnId: 'terminal-turn' };
      f.events.push(outcome === 'system-interrupted' ? {
        id: 'terminal', threadId: 'thr_native', seq: 1, createdAt,
        scope: { kind: 'thread' }, type: 'system/thread/interrupted', data: { reason: 'manual-stop' }
      } : {
        id: 'terminal', threadId: 'thr_native', seq: 1, createdAt, scope, type: 'turn/completed',
        data: { status: outcome, providerThreadId: null,
          ...(outcome === 'failed' ? { error: { message: 'Provider request failed' } } : {}) }
      });
      const expectedError = outcome === 'failed' ? 'Provider request failed' : null;
      for (const status of ['active', 'active', 'stopping', 'stopping', 'idle', 'idle']) {
        f.threadStatus(status, 'thr_native');
        const record = await f.service.get(item);
        const run = record.runs[0];
        assert.equal(run.status, status === 'idle' ? outcome === 'failed' ? 'failed' : 'canceled' : 'running');
        assert.equal(run.error, expectedError);
        assert.equal(run.finishedAt, new Date(createdAt).toISOString());
        assert.equal(run.cursor, 1);
        if (status === 'idle') assert.equal(run.activity, outcome === 'failed' ? 'Agent turn failed'
          : outcome === 'interrupted' ? 'Agent stopped' : 'Interrupted: manual-stop');
        assert.equal(record.runs.length, 1);
        assert.equal(f.spawns(), 1);
      }
      f.threadStatus('active', 'thr_native');
      const resumed = await f.service.get(item);
      assert.equal(resumed.runs[0].status, 'running');
      assert.equal(resumed.runs[0].finishedAt, null);
      assert.equal(resumed.runs[0].error, null);
      assert.equal(resumed.runs[0].activity, 'Agent working');
    } finally { f.db.close(); }
  });
}

test('polls preserve event-derived live activity until stopping', async () => {
  const f = fixture();
  try {
    await f.service.startTask(item, null);
    f.threadStatus('active', 'thr_native');
    const activities: [Parameters<typeof applyNativeEvent>[1], string][] = [
      [{
        id: 'plan', threadId: 'thr_native', seq: 1, createdAt: Date.now(),
        scope: { kind: 'turn', turnId: 'turn_1' }, type: 'turn/plan/updated',
        data: { plan: [{ step: 'Inspect project selection', status: 'active' }],
          providerThreadId: 'provider_1' }
      }, 'Inspect project selection'],
      ...([
        [{ type: 'commandExecution', id: 'command', command: 'npm test' }, 'Running: npm test'],
        [{ type: 'fileChange', id: 'files', changes: [] }, 'Editing files'],
        [{ type: 'agentMessage', id: 'message', text: '' }, 'Writing response']
      ] as const).map(([item, activity], index) => [{
        id: item.id, threadId: 'thr_native', seq: index + 2, createdAt: Date.now(),
        scope: { kind: 'turn', turnId: 'turn_1' }, type: 'item/started', data: { item }
      } as Parameters<typeof applyNativeEvent>[1], activity] satisfies [Parameters<typeof applyNativeEvent>[1], string])
    ];
    for (const [event, activity] of activities) {
      f.events.push(event);
      assert.equal((await f.service.get(item)).runs[0].activity, activity);
      await f.service.poll(new AbortController().signal);
      assert.equal(f.store.all()[0].runs[0].activity, activity);
    }
    f.threadStatus('stopping', 'thr_native');
    assert.equal((await f.service.get(item)).runs[0].activity, 'Stopping agent');
  } finally { f.db.close(); }
});

test('legacy successful completion waiting for idle still advances', async () => {
  const f = fixture();
  try {
    let record = await f.service.startTask(item, null);
    record.runs[0].finishedAt = new Date().toISOString();
    f.store.save(record);
    record = await f.service.get(item);
    assert.equal(record.runs[0].status, 'finished');
    assert.equal(record.runs[0].output, 'Observed repository findings');
    assert.equal(record.runs[1].kind, 'plan');
  } finally { f.db.close(); }
});

test('planning in a project checkout starts a fresh Build in a managed worktree exactly once', async () => {
  const f = fixture();
  try {
    f.unmanaged();
    await f.service.startTask(item, null);
    f.complete('Investigation findings');
    await f.service.get(item);
    f.complete('Implement current scope and verify');
    const [record] = await Promise.all([f.service.get(item), f.service.get(item)]);
    const input = f.spawnInput() as { originKind?: string; sourceThreadId?: string; environment: unknown; prompt: string };
    assert.equal(input.originKind, undefined);
    assert.equal(input.sourceThreadId, undefined);
    assert.deepEqual(input.environment, {
      type: 'host', hostId: 'host_test', workspace: { type: 'managed-worktree', baseBranch: { kind: 'default' } }
    });
    assert.match(input.prompt, /Implement current scope and verify/);
    assert.equal(record.runs.at(-1)?.kind, 'build');
    assert.equal(record.runs.at(-1)?.threadId, 'thr_build');
    assert.equal(record.runs.at(-1)?.environmentId, 'env_build');
    assert.equal(f.store.forThread('thr_native')?.locator, item.locator);
    assert.equal(f.store.forThread('thr_build')?.locator, item.locator);
    assert.equal(f.spawns(), 3);
    assert.equal(f.sends(), 0);
    await f.service.startTask(item, null);
    assert.equal(f.spawns(), 3);
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
    assert.equal(f.spawns(), 3);
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
    assert.equal(f.spawns(), 3);

    record.runs.at(-1)!.status = 'uncertain';
    record.runs.at(-1)!.error = 'Native dispatch outcome uncertain: HTTP 409: This project checkout has no usable git branch.. Inspect recent BB threads; no automatic retry.';
    f.store.save(record);
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.status, 'failed');
    assert.equal(f.spawns(), 3);
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
    assert.equal(f.sends(), 0);
    assert.equal(f.spawns(), 1);
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
    f.complete('::taskboard-result{kind="build" verdict="implemented" revision="def456"}\nChanged panel.ts; npm test passed. Revision def456, workspace /work/panel.');
    record = await f.service.get(item);
    assert.equal(record.stage, 'Review');
    assert.notEqual(record.runs.at(-1)!.threadId, buildThread);
    const input = f.spawnInput() as { environment: unknown; prompt: string };
    assert.deepEqual(input.environment, { type: 'reuse', environmentId: 'env_test' });
    assert.match(input.prompt, /Revision def456/);
    assert.match(input.prompt, /Authoring session: thr_native/);
    assert.match(input.prompt, /::taskboard-result\{kind="review"/);
    f.complete('::taskboard-result{kind="review" verdict="passed"}\nVerified def456 and required checks');
    record = await f.service.get(item);
    assert.equal(record.runs.at(-1)?.reviewResult?.verdict, 'passed');
    assert.equal(record.stage, 'Review');
    assert.equal(f.sends(), 1);
    assert.equal(f.spawns(), 1);
    assert.equal(f.progressWrites(), 0);
  } finally { f.db.close(); }
});

test('archived Build results survive polling and explicit review repair restores the same session once', async () => {
  for (const action of ['startTask', 'returnToBuild'] as const) {
    const f = fixture();
    try {
      const seeded = seedReview(f);
      f.archived.add('thr_native');
      const paused = await f.service.get(item);
      assert.equal(paused.runs[0].status, 'finished');
      assert.match(paused.automationError!, /authoring session is archived/);
      assert.equal(f.unarchives(), 0);
      assert.equal(f.sends(), 0);
      const resume = () => action === 'startTask' ? f.service.startTask(item, null) : f.service.start(item, {
        expectedVersion: paused.version, kind: 'build', contextThreadId: null, retry: false
      });
      await Promise.all([resume(), resume()]);
      const repaired = f.store.all()[0];
      assert.equal(repaired.runs.length, 3);
      assert.equal(repaired.runs.at(-1)?.repairOf, seeded.runs[1].id);
      assert.equal(repaired.runs.at(-1)?.threadId, 'thr_native');
      assert.equal(repaired.runs.at(-1)?.environmentId, 'env_test');
      assert.equal(repaired.automationError, null);
      assert.equal(f.unarchives(), 1);
      assert.equal(f.sends(), 1);
      assert.equal(f.spawns(), 0);
    } finally { f.db.close(); }
  }
});

test('legacy archive-only failure preserves completed evidence and can return to Build', async () => {
  const f = fixture();
  try {
    const record = seedReview(f);
    Object.assign(record.runs[0], {
      status: 'failed', finishedAt: new Date().toISOString(),
      error: 'Native session is unavailable or failed. Open its thread for details.'
    });
    f.store.save(record);
    f.archived.add('thr_native');
    const reconciled = await f.service.get(item);
    assert.equal(reconciled.runs[0].status, 'finished');
    assert.equal(reconciled.runs[0].output, record.runs[0].output);
    await f.service.startTask(item, null);
    assert.equal(f.sends(), 1);
  } finally { f.db.close(); }
});

test('archive recovery rejects deleted, moved, unavailable and busy Build sessions before restoration', async () => {
  for (const failure of ['deleted', 'moved', 'destroyed', 'busy', 'unmanaged', 'scope'] as const) {
    const f = fixture();
    try {
      const record = seedReview(f, blockedReview, false);
      record.runs[1].reviewResult = readReviewResult(blockedReview);
      const saved = f.store.save(record);
      f.archived.add('thr_native');
      if (failure === 'deleted') f.deleted.add('thr_native');
      if (failure === 'moved') f.buildEnvironment('env_other');
      if (failure === 'destroyed') f.environmentStatus('destroyed');
      if (failure === 'busy') f.threadStatus('active', 'thr_native');
      if (failure === 'unmanaged') f.unmanaged();
      await assert.rejects(f.service.start(
        failure === 'scope' ? { ...item, description: 'Changed scope' } : item,
        { expectedVersion: saved.version, kind: 'build', contextThreadId: null, retry: false }
      ));
      assert.equal(f.unarchives(), 0);
      assert.equal(f.sends(), 0);
      assert.equal(f.spawns(), 0);
      assert.equal(f.store.all()[0].runs.length, 2);
    } finally { f.db.close(); }
  }
});

test('archive recovery rechecks identity and idle state and does not dispatch after restoration failures', async () => {
  for (const failure of ['moved', 'busy', 'destroyed', 'transport'] as const) {
    const f = fixture();
    try {
      seedReview(f, blockedReview, false);
      f.archived.add('thr_native');
      const record = await f.service.get(item);
      f.onUnarchive(() => {
        if (failure === 'moved') f.buildEnvironment('env_other');
        if (failure === 'busy') f.threadStatus('active', 'thr_native');
        if (failure === 'destroyed') f.environmentStatus('destroyed');
        if (failure === 'transport') throw new Error('Unarchive response lost');
      });
      await assert.rejects(f.service.start(item, {
        expectedVersion: record.version, kind: 'build', contextThreadId: null, retry: false
      }));
      assert.equal(f.unarchives(), 1);
      assert.equal(f.sends(), 0);
      assert.equal(f.store.all()[0].runs.length, 2);
    } finally { f.db.close(); }
  }
});

test('a lost send after unarchive stays uncertain across restart without another dispatch', async () => {
  const f = fixture();
  try {
    seedReview(f, blockedReview, false);
    f.archived.add('thr_native');
    const record = await f.service.get(item);
    f.failSend();
    const resumed = await f.service.start(item, {
      expectedVersion: record.version, kind: 'build', contextThreadId: null, retry: false
    });
    assert.equal(resumed.runs.at(-1)?.status, 'uncertain');
    await f.service.recover();
    await f.service.startTask(item, null);
    assert.equal(f.unarchives(), 1);
    assert.equal(f.sends(), 1);
    assert.equal(f.spawns(), 0);
  } finally { f.db.close(); }
});

test('Start task restoration failure keeps the review actionable without a phantom Build run', async () => {
  const f = fixture();
  try {
    seedReview(f);
    f.archived.add('thr_native');
    await f.service.get(item);
    f.onUnarchive(() => { throw new Error('Unarchive unavailable'); });
    const paused = await f.service.startTask(item, null);
    assert.match(paused.automationError!, /Unarchive unavailable/);
    assert.equal(paused.runs.length, 2);
    assert.equal(paused.stage, 'Review');
    assert.equal(f.sends(), 0);
  } finally { f.db.close(); }
});

test('explicit blocked Build continuation restores its archived thread without a replacement', async () => {
  const f = fixture();
  try {
    const record = seedReview(f);
    record.runs.pop();
    record.stage = 'Build';
    const build = record.runs[0];
    build.buildResult = { verdict: 'blocked', summary: 'Finish the implementation', revision: null };
    build.output = `<taskboard-build>${JSON.stringify(build.buildResult)}</taskboard-build>`;
    f.store.save(record);
    f.archived.add('thr_native');
    await f.service.get(item);
    assert.equal(f.unarchives(), 0);
    const resumed = await f.service.startTask(item, null);
    assert.equal(resumed.runs.at(-1)?.continuationOf, build.id);
    assert.equal(resumed.runs.at(-1)?.threadId, build.threadId);
    assert.equal(f.unarchives(), 1);
    assert.equal(f.sends(), 1);
    assert.equal(f.spawns(), 0);
  } finally { f.db.close(); }
});

test('automatic blocked Build continuation never restores an archived session', async () => {
  const f = fixture();
  try {
    const record = seedReview(f);
    record.runs.pop();
    record.stage = 'Build';
    const build = record.runs[0];
    build.buildResult = { verdict: 'blocked', summary: 'Finish the implementation', revision: null };
    build.output = `<taskboard-build>${JSON.stringify(build.buildResult)}</taskboard-build>`;
    f.store.save(record);
    f.archived.add('thr_native');
    const paused = await f.service.get(item);
    assert.equal(paused.runs.length, 1);
    assert.match(paused.automationError!, /authoring session is archived/);
    assert.equal(f.unarchives(), 0);
    assert.equal(f.sends(), 0);
  } finally { f.db.close(); }
});

test('legacy workspace metadata backfill does not invalidate a current Start request', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    const investigation = startRun(record, 'investigate', false);
    Object.assign(investigation, {
      status: 'finished', threadId: 'thr_native', environmentId: 'env_test',
      output: 'Investigation complete. Preserve the current workspace.'
    });
    const saved = f.store.save(record);
    assert.equal(saved.runs[0].hostId, null);
    assert.equal(saved.runs[0].checkoutRoot, null);
    const started = await f.service.start(item, {
      expectedVersion: saved.version, kind: 'plan', contextThreadId: null, retry: false
    });
    assert.equal(started.runs[0].hostId, 'host_test');
    assert.equal(started.runs[0].checkoutRoot, '/repo/worktree');
    assert.equal(started.runs.at(-1)?.kind, 'plan');
    assert.equal(started.runs.at(-1)?.status, 'running');
    assert.equal(f.spawns(), 1);
  } finally { f.db.close(); }
});

test('retrying a rejected Build dispatch reuses the existing implementation worktree', async () => {
  const f = fixture();
  try {
    const record = newRecord(item);
    savePlan(record, 'Implement current scope and run the relevant checks');
    approvePlan(record, record.plans[0].digest);
    const implementation = startRun(record, 'build', false);
    Object.assign(implementation, {
      status: 'finished', threadId: 'thr_native', environmentId: 'env_test',
      output: '::taskboard-result{kind="build" verdict="blocked"}\nFinish verification.',
      buildResult: { verdict: 'blocked', summary: 'Finish verification.', revision: null }
    });
    const rejected = startRun(record, 'build', false);
    Object.assign(rejected, {
      status: 'failed', error: 'BB rejected the environment before starting a session.',
      activity: 'Native session was not started'
    });
    const saved = f.store.save(record);
    const retried = await f.service.start(item, {
      expectedVersion: saved.version, kind: 'build', contextThreadId: null, retry: true
    });
    assert.equal(retried.runs.at(-1)?.environmentId, 'env_test');
    assert.deepEqual((f.spawnInput() as { environment: unknown }).environment,
      { type: 'reuse', environmentId: 'env_test' });
    assert.equal(f.unarchives(), 0);
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
    f.events.push({
      id: 'review-completed', threadId: 'thr_review_seed', seq: 1, createdAt: Date.now(),
      scope: { kind: 'turn', turnId: 'review-turn' }, type: 'turn/completed',
      data: { status: 'completed', providerThreadId: null }
    });
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

test('actionable blocked Builds continue automatically twice and manual continuation does not reset the budget', async () => {
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
    blocked.output = '::taskboard-result{kind="build" verdict="blocked"}\nFinish the remaining validation.';
    blocked.buildResult = readBuildResult(blocked.output);
    f.store.save(record);

    let current = await f.service.get(item);
    assert.equal(current.runs.at(-1)?.continuationOf, blocked.id);
    f.complete('::taskboard-result{kind="build" verdict="blocked"}\nThe validation is still actionable.');
    current = await f.service.get(item);
    assert.equal(current.runs.filter(run => run.continuationOf).length, 2);
    f.complete('::taskboard-result{kind="build" verdict="blocked"}\nOne actionable step remains.');
    current = await f.service.get(item);
    assert.match(current.automationError ?? '', /continuation limit reached \(2 attempts\)/);
    assert.equal(f.sends(), 2);

    current = await f.service.startTask(item, null);
    assert.equal(current.runs.filter(run => run.continuationOf).length, 3);
    assert.equal(f.sends(), 3);
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
    assert.equal(f.sends(), 0);
    await f.service.get(item);
    assert.equal(f.sends(), 0);
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
