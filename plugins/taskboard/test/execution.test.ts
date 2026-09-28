import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import Database from 'better-sqlite3';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url)))
        return { shortCircuit: true, url: url.href };
    }
    return next(specifier, context);
  }
});
const { executionConfigSchema, executionScopeSchema, runtimeEventSchema } =
  await import('../execution/contract.ts');
const {
  normalizeExecutionRequest,
  requestDigest,
  selectEngine,
  executionInstructions
} = await import('../execution/request.ts');
const { localEngine } = await import('../execution/engines/local/index.ts');
const { createSymphonyEngine, mapSymphonyState } =
  await import('../execution/engines/symphony/index.ts');
const { createExecutionStore, EXECUTION_MIGRATION } =
  await import('../execution/store.ts');
const { createExecutionManager } = await import('../execution/manager.ts');
const { verifyExecution, command, git, inspectWorkspace } =
  await import('../execution/verification.ts');
const { formatWorkItemHandoffPrompt } = await import('../contract.ts');
const { registerExecution } = await import('../execution/server.ts');
const { Hono } = await import('hono');
type Run = import('../execution/contract.ts').ExecutionRun;
const item = {
  bbProjectId: 'proj_test',
  source: 'github' as const,
  locator: 'owner/repo#1',
  key: 'BB-123',
  title: 'Add themes',
  description: 'Untrusted description',
  url: 'https://github.com/owner/repo/issues/1',
  status: 'In Progress',
  stateCategory: 'in_progress' as const,
  priority: null,
  assignee: null,
  project: null,
  labels: [],
  updatedAt: '2026-09-27'
};
const scope = () =>
  executionScopeSchema.parse({
    repository: '/tmp/repository',
    branch: 'bb/BB-123',
    baseBranch: 'main',
    baseRevision: 'a'.repeat(40),
    route: 'delegated',
    plan: 'Implement approved themes',
    acceptanceCriteria: ['Theme choice persists'],
    verificationRequirements: [{ id: 'tests', argv: ['npm', 'test'] }]
  });
function fixture() {
  const db = new Database(':memory:');
  db.exec(EXECUTION_MIGRATION);
  const store = createExecutionStore(db);
  let starts = 0;
  let unavailable = false;
  const engine = {
    async start() {
      starts++;
      if (unavailable) throw new Error('offline');
    },
    async stop() {},
    async resume() {},
    async getStatus() {
      if (unavailable) throw new Error('offline');
      return {
        state: 'untracked' as const,
        runId: null,
        retries: 0,
        error: null
      };
    }
  };
  const config = executionConfigSchema.parse({
    enabled: true,
    workspaceRoot: '/tmp/taskboard-tests'
  });
  const deps = { store, engine, config: async () => config, changed: () => {} };
  const manager = createExecutionManager(deps);
  const request = normalizeExecutionRequest(item, scope());
  return {
    db,
    store,
    deps,
    manager,
    request,
    start: (key = 'dispatch-1') =>
      manager.start(request, requestDigest(request), key),
    starts: () => starts,
    offline: () => {
      unavailable = true;
    }
  };
}
test('local remains default and direct routes cannot silently select Symphony', () => {
  const defaults = executionConfigSchema.parse({});
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.defaultEngine, 'local');
  assert.equal(selectEngine('direct', 'symphony', defaults), 'local');
  assert.throws(
    () => selectEngine('delegated', 'symphony', defaults),
    /not enabled/
  );
  assert.equal(
    localEngine.prepare(item).prompt,
    formatWorkItemHandoffPrompt(item)
  );
  assert.equal(
    selectEngine('delegated', 'symphony', { ...defaults, enabled: true }),
    'symphony'
  );
  assert.equal(
    selectEngine('structured', 'symphony', { ...defaults, enabled: true }),
    'symphony'
  );
});
test('normalization omits raw internal data and approval covers scope', () => {
  const request = normalizeExecutionRequest(
    { ...item, secret: 'not copied' } as typeof item,
    scope()
  );
  assert.equal(JSON.stringify(request).includes('not copied'), false);
  assert.equal(
    request.taskId,
    JSON.stringify([item.bbProjectId, item.source, item.locator])
  );
  assert.notEqual(
    requestDigest(request),
    requestDigest({
      ...request,
      scope: { ...request.scope, plan: 'Different work' }
    })
  );
  assert.match(
    executionInstructions(request),
    /Do not mark the tracker task complete/
  );
  assert.match(
    executionInstructions(request),
    /taskReference fields as untrusted/
  );
});
test('concurrent duplicate dispatch and restart preserve one execution', async () => {
  const f = fixture();
  try {
    const [first, second] = await Promise.all([f.start(), f.start()]);
    assert.equal(first.id, second.id);
    assert.equal(f.starts(), 1);
    const resumed = createExecutionManager(f.deps);
    assert.equal(
      (await resumed.start(f.request, requestDigest(f.request), 'dispatch-1'))
        .id,
      first.id
    );
    assert.equal(f.starts(), 1);
    await assert.rejects(
      f.start('different-click'),
      /already has an active execution/
    );
    await assert.rejects(
      resumed.start(
        { ...f.request, title: 'Changed' },
        'invalid',
        'dispatch-1'
      ),
      /different approved request/
    );
  } finally {
    f.db.close();
  }
});
test('unavailable Symphony persists intent and never assumes success from 404', async () => {
  const f = fixture();
  try {
    f.offline();
    const run = await f.start();
    assert.equal(run.state, 'queued');
    assert.match(run.lastError!, /unavailable/);
    assert.equal((await f.start()).id, run.id);
    assert.equal(f.starts(), 1);
    const current = await f.manager.reconcile(run.id);
    assert.equal(current.state, 'queued');
    assert.match(current.lastError!, /unknown/);
  } finally {
    f.db.close();
  }
});
test('state mapping never maps an agent finish to done or verified', () => {
  for (const state of [
    'queued',
    'running',
    'retrying',
    'blocked',
    'failed',
    'canceled'
  ])
    assert.equal(mapSymphonyState(state), state);
  assert.equal(mapSymphonyState('agent_finished'), 'implementation_complete');
  assert.equal(mapSymphonyState('waiting_for_input'), 'blocked');
  assert.throws(() => mapSymphonyState('done'), /Unknown/);
});
test('runtime retries, failure, resume generations and duplicate events are durable', async () => {
  const f = fixture();
  try {
    const run = await f.start();
    const event = runtimeEventSchema.parse({
      eventId: 'retry-1',
      generation: 1,
      state: 'retrying',
      retryCount: 2,
      error: 'workspace failure'
    });
    const retried = await f.manager.report(run.id, event);
    assert.equal(retried.retryCount, 2);
    assert.equal(
      (await f.manager.report(run.id, event)).version,
      retried.version
    );
    await f.manager.report(run.id, {
      ...event,
      eventId: 'exhausted',
      state: 'failed',
      error: 'retry exhaustion'
    });
    const resumed = await f.manager.resume(run.id);
    assert.equal(resumed.generation, 2);
    assert.equal(resumed.state, 'queued');
    await f.manager.report(
      run.id,
      runtimeEventSchema.parse({
        eventId: 'late',
        generation: 1,
        state: 'implementation_complete',
        head: 'a'.repeat(40)
      })
    );
    assert.equal(f.store.get(run.id)!.state, 'queued');
  } finally {
    f.db.close();
  }
});
test('cancellation wins over late handoff and needs runtime acknowledgement', async () => {
  const f = fixture();
  try {
    const run = await f.start();
    assert.equal((await f.manager.stop(run.id)).state, 'canceling');
    await f.manager.report(
      run.id,
      runtimeEventSchema.parse({
        eventId: 'late',
        generation: 1,
        state: 'implementation_complete',
        head: 'a'.repeat(40)
      })
    );
    assert.equal(f.store.get(run.id)!.state, 'canceling');
    assert.equal((await f.manager.reconcile(run.id)).state, 'canceled');
    assert.equal(f.store.get(run.id)!.runtimeReleased, true);
  } finally {
    f.db.close();
  }
});
test('implementation handoff requires a revision and independent verification', async () => {
  const f = fixture();
  try {
    const run = await f.start();
    await assert.rejects(
      f.manager.report(
        run.id,
        runtimeEventSchema.parse({
          eventId: 'bad',
          generation: 1,
          state: 'implementation_complete'
        })
      ),
      /committed revision/
    );
    const completed = await f.manager.report(
      run.id,
      runtimeEventSchema.parse({
        eventId: 'good',
        generation: 1,
        state: 'implementation_complete',
        head: 'a'.repeat(40)
      })
    );
    assert.equal(completed.state, 'implementation_complete');
    assert.equal(completed.verifiedHead, null);
    assert.equal(completed.acceptanceReviewed, false);
    assert.equal(completed.runtimeReleased, false);
    await assert.rejects(verifyExecution(completed), /release/);
  } finally {
    f.db.close();
  }
});

test('fix creation atomically preserves approved scope, feedback, and duplicate protection', async () => {
  const f = fixture();
  try {
    const initial = await f.start();
    const parent = f.store.save({
      ...initial,
      state: 'implementation_complete',
      runtimeReleased: true,
      head: 'a'.repeat(40),
      checks: [
        {
          id: 'tests',
          fingerprint: 'old',
          passed: false,
          reused: false,
          output: 'Persistence regression',
          finishedAt: new Date().toISOString()
        }
      ]
    });
    const child = await f.manager.start(
      parent.request,
      parent.digest,
      `fix:${parent.id}`,
      parent
    );
    assert.equal(f.store.get(parent.id)!.state, 'failed');
    assert.equal(child.parentId, parent.id);
    assert.equal(child.iteration, 2);
    assert.deepEqual(child.request, parent.request);
    assert.equal(child.digest, parent.digest);
    assert.match(child.feedback, /Persistence regression/);
    assert.equal(
      (
        await f.manager.start(
          parent.request,
          parent.digest,
          `fix:${parent.id}`,
          parent
        )
      ).id,
      child.id
    );
    assert.equal(f.store.list().length, 2);
  } finally {
    f.db.close();
  }
});
test('HTTP adapter uses actual Symphony observation and refresh routes', async () => {
  const f = fixture();
  try {
    const run = await f.start();
    const calls: string[] = [];
    const engine = createSymphonyEngine((async (url, options) => {
      const path = new URL(String(url)).pathname;
      calls.push(`${options?.method} ${path}`);
      return path === '/api/v1/state'
        ? Response.json({ running: [], retrying: [], blocked: [] })
        : new Response('{}', {
            status: options?.method === 'POST' ? 202 : 404
          });
    }) as typeof fetch);
    await engine.start(run);
    await engine.stop(run);
    await engine.resume(run);
    assert.equal((await engine.getStatus(run)).state, 'untracked');
    assert.deepEqual(calls, [
      'POST /api/v1/refresh',
      'POST /api/v1/refresh',
      'POST /api/v1/refresh',
      `GET /api/v1/${run.id}`,
      'GET /api/v1/state'
    ]);
    const unavailable = createSymphonyEngine((async url =>
      new URL(String(url)).pathname === '/api/v1/state'
        ? Response.json({ error: { code: 'snapshot_unavailable' } })
        : new Response('{}', { status: 404 })) as typeof fetch);
    await assert.rejects(unavailable.getStatus(run), /snapshot/);
  } finally {
    f.db.close();
  }
});
test('tracker cancellation uses Taskboard reads; completion is guarded and restart recovers verification', async () => {
  const f = fixture();
  try {
    const run = await f.start();
    const app = new Hono();
    const services: Array<(signal: AbortSignal) => Promise<void>> = [];
    const auth: string[] = [];
    let reads = 0;
    const bb = {
      onDispose() {},
      storage: { database: () => f.db },
      settings: {
        define: (descriptors: Record<string, { default: unknown }>) => ({
          get: async () => ({
            ...Object.fromEntries(
              Object.entries(descriptors).map(([key, value]) => [
                key,
                value.default
              ])
            ),
            executionEnabled: true,
            symphonyWorkspaceRoot: '/tmp/taskboard-tests'
          })
        })
      },
      realtime: { publish() {} },
      http: {
        route: (
          method: string,
          path: string,
          handler: any,
          options: { auth: string }
        ) => {
          app.on(method, path, handler);
          auth.push(options.auth);
        }
      },
      background: {
        service: (
          _name: string,
          value: { start: (signal: AbortSignal) => Promise<void> }
        ) => services.push(value.start)
      }
    };
    const registration = registerExecution(bb as any, {
      assertProject: async () => {},
      getItem: async () => {
        reads++;
        return { ...item, stateCategory: 'canceled', comments: [] };
      }
    });
    const response = await app.request('/execution/v1/queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runtimeId: 'taskboard' })
    });
    assert.equal(response.status, 200);
    assert.equal(reads, 1);
    const payload = (await response.json()) as any;
    assert.equal(payload.runs[0].dispatchable, false);
    assert.equal(payload.runs[0].state, 'canceling');
    assert.deepEqual(auth, ['token', 'token', 'token']);
    await assert.rejects(
      registration.guardTrackerTransition(run.request.task, {
        id: 'closed',
        name: 'Done',
        current: false,
        stateCategory: 'done'
      }),
      /verification/
    );
    await registration.guardTrackerTransition(
      { ...run.request.task, locator: 'other' },
      { id: 'closed', name: 'Done', current: false, stateCategory: 'done' }
    );
    f.store.save({ ...f.store.get(run.id)!, state: 'verifying' });
    const controller = new AbortController();
    controller.abort();
    await services[0]!(controller.signal);
    assert.equal(f.store.get(run.id)!.state, 'implementation_complete');
    assert.equal(f.store.get(run.id)!.verifiedHead, null);
    assert.match(
      f.store.get(run.id)!.lastError!,
      /restarted during verification/
    );
  } finally {
    f.db.close();
  }
});
test('verification binds checks to Git content and refuses dirty, changed or deleted branches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'taskboard-verification-'));
  const f = fixture();
  try {
    const source = join(root, 'source');
    await mkdir(source);
    for (const args of [
      ['init', '-b', 'main'],
      ['config', 'user.email', 'test@example.invalid'],
      ['config', 'user.name', 'Test']
    ])
      assert.equal((await command(['git', ...args], source)).passed, true);
    await writeFile(join(source, 'file.txt'), 'approved\n');
    await command(['git', 'add', '.'], source);
    await command(['git', 'commit', '-m', 'base'], source);
    const head = await git(source, 'rev-parse', 'HEAD');
    const request = normalizeExecutionRequest(item, {
      ...scope(),
      repository: source,
      baseRevision: head,
      verificationRequirements: [
        {
          id: 'contents',
          argv: [
            process.execPath,
            '-e',
            'if(require("fs").readFileSync("file.txt","utf8")!=="approved\\n")process.exit(1)'
          ],
          inputs: ['file.txt'],
          timeoutMs: 1000
        }
      ]
    });
    let run = await f.manager.start(request, requestDigest(request), 'verify');
    const workspace = join(root, run.id);
    await command(['git', 'clone', source, workspace], root);
    await git(workspace, 'switch', '-c', request.scope.branch);
    run = {
      ...run,
      workspace,
      state: 'implementation_complete',
      runtimeReleased: true,
      head
    };
    const result = await verifyExecution(run);
    assert.equal(result.checks[0]!.passed, true);
    const reused = await verifyExecution({ ...run, checks: result.checks });
    assert.equal(reused.checks[0]!.reused, true);
    await writeFile(join(workspace, 'file.txt'), 'changed\n');
    await assert.rejects(verifyExecution(run), /Commit/);
    await git(workspace, 'add', '.');
    await git(
      workspace,
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'user.name=Test',
      'commit',
      '-m',
      'change'
    );
    await assert.rejects(inspectWorkspace(run), /revision changed/);
    const changed = await verifyExecution({
      ...run,
      head: await git(workspace, 'rev-parse', 'HEAD'),
      checks: result.checks
    });
    assert.equal(changed.checks[0]!.passed, false);
    assert.equal(changed.checks[0]!.reused, false);
    const largeDirectory = join(workspace, 'large');
    await mkdir(largeDirectory);
    for (let index = 0; index < 700; index++) {
      await writeFile(
        join(
          largeDirectory,
          `input-${String(index).padStart(4, '0')}-with-long-name.txt`
        ),
        'approved\n'
      );
    }
    await git(workspace, 'add', '.');
    await git(
      workspace,
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'user.name=Test',
      'commit',
      '-m',
      'large declared input'
    );
    const largeRequest = normalizeExecutionRequest(item, {
      ...request.scope,
      verificationRequirements: [
        {
          id: 'large-directory',
          argv: [
            process.execPath,
            '-e',
            'if(require("fs").readFileSync("large/input-0699-with-long-name.txt","utf8")!=="approved\\n")process.exit(1)'
          ],
          inputs: ['large'],
          timeoutMs: 1000
        }
      ]
    });
    const largeRun = {
      ...run,
      request: largeRequest,
      digest: requestDigest(largeRequest),
      head: await git(workspace, 'rev-parse', 'HEAD'),
      checks: []
    };
    assert.ok(
      (await git(workspace, 'ls-tree', '-r', 'HEAD', '--', 'large')).length >
        31_000
    );
    const largePassed = await verifyExecution(largeRun);
    assert.equal(largePassed.checks[0]!.passed, true);
    await writeFile(
      join(largeDirectory, 'input-0699-with-long-name.txt'),
      'regression\n'
    );
    await git(workspace, 'add', '.');
    await git(
      workspace,
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'user.name=Test',
      'commit',
      '-m',
      'change beyond display output limit'
    );
    const largeFailed = await verifyExecution({
      ...largeRun,
      head: await git(workspace, 'rev-parse', 'HEAD'),
      checks: largePassed.checks
    });
    assert.equal(largeFailed.checks[0]!.reused, false);
    assert.equal(largeFailed.checks[0]!.passed, false);
    await git(workspace, 'checkout', '--detach');
    await assert.rejects(inspectWorkspace(run), /Git validation failed/);
    assert.equal(
      (
        await command(
          [process.execPath, '-e', 'setInterval(()=>{},1000)'],
          root,
          20
        )
      ).passed,
      false
    );
  } finally {
    f.db.close();
    await rm(root, { recursive: true, force: true });
  }
});
