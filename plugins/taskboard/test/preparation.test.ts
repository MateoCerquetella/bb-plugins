import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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
const { safeContextPath, containsCredential, collectContext } = await import(
  '../preparation/context.ts'
);
const { preparationRpc, parseAgentResult, sandboxHtml, taskRefSchema } = await import(
  '../preparation/contract.ts'
);
const { registerPreparation } = await import('../preparation/server.ts');

test('preparation references retain support for every Taskboard tracker', () => {
  for (const source of ['github', 'gitlab', 'linear', 'jira']) {
    assert.equal(taskRefSchema.parse({
      projectId: 'proj_test', source, locator: 'issue-1',
      title: 'Example', key: 'ISSUE-1', url: 'https://example.com/issues/1'
    }).source, source);
  }
});

test('repository context excludes credentials, generated content and symlink escapes', async () => {
  assert.equal(safeContextPath('src/styles/tokens.css'), true);
  assert.equal(containsCredential('{"api_key":"abcdefghijklmnop"}'), true);
  const root = await mkdtemp(join(tmpdir(), 'prepare-context-'));
  const outside = await mkdtemp(join(tmpdir(), 'prepare-outside-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    await mkdir(join(root, 'src'));
    await writeFile(
      join(root, 'README.md'),
      '# Product\nExisting milestone overview.'
    );
    await writeFile(
      join(root, 'src', 'Overview.tsx'),
      'export const title = "Milestone overview";'
    );
    await writeFile(join(root, '.env'), 'TOKEN=not-for-the-model');
    await writeFile(
      join(root, 'src', 'config.json'),
      ' {"api_key": "sk-proj-123456789012345678901234567890"}'
    );
    await writeFile(join(outside, 'outside.md'), 'private host content');
    await symlink(join(outside, 'outside.md'), join(root, 'escape.md'));
    execFileSync('git', ['-C', root, 'add', '.']);
    const result = await collectContext(root, 'milestone overview');
    assert.ok(result.sources.some((s) => s.path === 'README.md'));
    assert.ok(result.sources.some((s) => s.path === 'src/Overview.tsx'));
    assert.ok(!JSON.stringify(result.sources).includes('sk-proj-'));
    assert.ok(!JSON.stringify(result.sources).includes('private host content'));
    assert.ok(!result.inventory.includes('.env'));
    assert.ok(result.sources.length <= 24);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
test('context and generation boundaries reject dangerous and malformed input', () => {
  for (const path of [
    '../README.md',
    '/root/file.ts',
    '.env.local',
    'node_modules/lib/main.ts',
    'src/credentials.json',
    'private/secrets.md',
    'dist/app.js'
  ])
    assert.equal(safeContextPath(path), false, path);
  assert.equal(containsCredential('-----BEGIN RSA PRIVATE KEY-----'), true);
  for (const value of [
    'password: abcdefghijklmnop',
    'API_KEY=abcdefghijk',
    'client_secret: short',
    'token: |\n  abcdefghijklmnop'
  ])
    assert.equal(containsCredential(value), true, value);
  assert.equal(
    preparationRpc.prepareGenerate.input.safeParse({
      id: 'a',
      projectId: 'p',
      count: 5,
      direction: ''
    }).success,
    false
  );
  assert.equal(
    preparationRpc.prepareGenerate.input.safeParse({
      id: 'a',
      projectId: 'p',
      count: 1.5,
      direction: ''
    }).success,
    false
  );
  assert.throws(() => parseAgentResult('I did some research', 'brief'));
  assert.throws(() => parseAgentResult('x'.repeat(200001), 'prototype'));
  assert.ok(
    'html' in
      parseAgentResult(
        JSON.stringify({
          name: 'Layout',
          explanation: 'Interaction',
          html: '<main>' + 'sample '.repeat(30) + '</main>'
        }),
        'prototype'
      )
  );
  const html = sandboxHtml(
    '<script>parent.location="https://example.com"</script>'
  );
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<iframe'));
  assert.ok(!html.includes('<script>parent.location'));
  assert.match(html, /frame-src about:/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
});

test('real SQLite preparation retains direct edits, project isolation, jobs and settings after reload', async () => {
  const db = new Database(':memory:');
  let registeredTool: any;
  let calls: any[] = [];
  const hostCalls: any[] = [];
  const bb: any = {
    storage: { database: () => db },
    hosts: {
      experimental_client: () => ({
        call: async (method: string, input: any, opts: any) => {
          hostCalls.push({ method, input, opts });
          return method === 'workspace'
            ? { path: '/plugin-data/' + input.id }
            : {
                root: '/remote/repo',
                commit: 'abc',
                inventory: ['README.md'],
                totalPaths: 1,
                sources: [],
                notes: [],
                digest: 'digest'
              };
        }
      })
    },
    rpc: { register() {} },
    ui: { registerMentionProvider() {} },
    agents: {
      registerTool(t: any) {
        registeredTool = t;
      }
    },
    realtime: { publish() {} },
    background: { service() {} },
    log: { warn() {} },
    sdk: {
      threads: {
        get: async () => ({
          id: 'thread',
          projectId: 'project',
          environmentId: 'env',
          providerId: 'codex'
        }),
        promptHistory: async () => [],
        defaultExecutionOptions: async () => ({
          model: 'chosen-model',
          permissionMode: 'auto',
          reasoningLevel: 'high',
          serviceTier: 'fast'
        })
      },
      environments: {
        get: async () => ({
          id: 'env',
          projectId: 'project',
          hostId: 'remote-host',
          path: '/remote/repo',
          status: 'ready'
        })
      }
    }
  };
  const deps = {
    assertProject: async () => {},
    task: async (projectId: string, source: any, locator: string) => ({
      projectId,
      source,
      locator,
      title: 'Task',
      key: 'T-1',
      url: 'https://example.com/task'
    })
  };
  const { handlers, store } = registerPreparation(bb, deps);
  const p = await handlers.prepareCreate({
    projectId: 'project',
    request: 'Milestone overview'
  });
  assert.equal(p.brief.revision, 0);
  await assert.rejects(() =>
    registeredTool.execute(
      { preparationId: p.id },
      { threadId: 'thread', projectId: 'other' }
    )
  );
  await registeredTool.execute(
    { preparationId: p.id },
    { threadId: 'thread', projectId: 'project' }
  );
  await registeredTool.execute(
    { preparationId: p.id },
    { threadId: 'thread', projectId: 'project' }
  );
  let saved = store.get(p.id);
  assert.equal(saved.jobs.length, 1);
  assert.equal(saved.hostId, 'remote-host');
  assert.equal(saved.execution?.model, 'chosen-model');
  assert.equal(saved.execution?.permissionMode, 'auto');
  saved = await handlers.prepareEdit({
    id: p.id,
    projectId: 'project',
    expectedRevision: 0,
    title: 'User title',
    description: 'User edited brief'
  });
  assert.equal(saved.brief.revision, 1);
  assert.equal(saved.history[0]?.description, '');
  assert.throws(() =>
    handlers.prepareEdit({
      id: p.id,
      projectId: 'project',
      expectedRevision: 0,
      title: 'stale',
      description: 'Overwrite'
    })
  );
  assert.throws(() =>
    handlers.prepareGet({ id: p.id, projectId: 'wrong-project' })
  );
  const reloaded = registerPreparation(bb, deps);
  assert.equal(reloaded.store.get(p.id).brief.title, 'User title');
  assert.equal(reloaded.store.get(p.id).request, 'Milestone overview');
  db.close();
});

test('job service routes context to the remote host and preserves partial success and immutable retries', async () => {
  const db = new Database(':memory:');
  let service: (signal: AbortSignal) => Promise<void> = async () => {};
  let registeredTool: any;
  const controller = new AbortController();
  const hostCalls: any[] = [];
  const spawns: any[] = [];
  let poll = false;
  const bb: any = {
    pluginId: 'taskboard',
    storage: { database: () => db },
    rpc: { register() {} },
    ui: { registerMentionProvider() {} },
    agents: {
      registerTool(t: any) {
        registeredTool = t;
      }
    },
    realtime: { publish() {} },
    log: { warn() {} },
    background: {
      service(_name: string, entry: any) {
        service = entry.start;
      }
    },
    hosts: {
      experimental_client: () => ({
        call: async (method: string, input: any, options: any) => {
          hostCalls.push({ method, input, options });
          return method === 'workspace'
            ? { path: '/isolated/' + input.id }
            : {
                root: '/remote/target',
                commit: 'abc',
                inventory: ['README.md'],
                totalPaths: 1,
                sources: [],
                notes: [],
                digest: 'hash'
              };
        }
      })
    },
    sdk: {
      environments: {
        get: async () => ({
          id: 'env',
          projectId: 'project',
          hostId: 'remote-host',
          path: '/remote/target',
          status: 'ready'
        })
      },
      threads: {
        get: async ({ threadId }: any) => ({
          id: threadId,
          projectId: 'project',
          environmentId: 'env',
          providerId: 'codex',
          status: 'idle'
        }),
        promptHistory: async () => [],
        defaultExecutionOptions: async () => ({
          model: 'selected-model',
          permissionMode: 'auto',
          reasoningLevel: 'high',
          serviceTier: 'fast'
        }),
        spawn: async (args: any) => {
          spawns.push(args);
          return { id: 'job-thread-' + spawns.length };
        },
        output: async ({ threadId }: any) => {
          if (threadId === 'empty-job') return { output: null };
          if (threadId === 'job-thread-1')
            return {
              output: JSON.stringify({
                title: 'Source backed brief',
                description:
                  '## Problem\nFind tasks.\n## Proposed behavior\nSearchable list.\n## Open questions\nUnknown permissions.'
              })
            };
          if (threadId === 'job-thread-2')
            return {
              output: JSON.stringify({
                name: 'List',
                explanation: 'Focused list',
                html: '<main>' + 'Sample task '.repeat(20) + '</main>'
              })
            };
          return { output: 'malformed generation' };
        }
      }
    }
  };
  const { handlers, store } = registerPreparation(bb, {
    assertProject: async () => {},
    task: async () => {
      throw new Error('unused');
    }
  });
  const p = await handlers.prepareCreate({
    projectId: 'project',
    request: 'Explore task list'
  });
  await registeredTool.execute(
    { preparationId: p.id },
    { threadId: 'root-thread', projectId: 'project' }
  );
  const running = service(controller.signal);
  async function until(check: () => boolean) {
    const end = Date.now() + 9000;
    while (!check()) {
      if (Date.now() > end) throw new Error('Job service did not advance');
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  try {
    await until(() => store.get(p.id).brief.revision === 1);
    assert.ok(hostCalls.every((call) => call.options.hostId === 'remote-host'));
    assert.equal(spawns[0].environment.workspace.type, 'unmanaged');
    assert.match(spawns[0].environment.workspace.path, /^\/isolated\//);
    assert.equal(spawns[0].model, 'selected-model');
    assert.equal(spawns[0].executionInputSources.model, 'explicit');
    assert.notEqual(spawns[0].environment.workspace.path, '/remote/target');
    await handlers.prepareGenerate({
      id: p.id,
      projectId: 'project',
      count: 2,
      direction: 'Distinct layouts'
    });
    await until(
      () =>
        store
          .get(p.id)
          .jobs.filter(
            (j) =>
              j.kind === 'prototype' &&
              ['succeeded', 'failed'].includes(j.status)
          ).length === 2
    );
    const completed = store.get(p.id);
    assert.equal(completed.versions.length, 1);
    const failed = completed.jobs.find((j) => j.status === 'failed')!;
    const oldVersion = completed.versions[0]!;
    await handlers.prepareRetry({
      id: p.id,
      projectId: 'project',
      jobId: failed.id
    });
    const retried = store.get(p.id);
    assert.equal(retried.versions[0]?.id, oldVersion.id);
    assert.equal(retried.jobs.length, 4);
    assert.equal(retried.jobs.at(-1)?.alternativeId, failed.alternativeId);
    assert.equal(
      store.artifact(oldVersion.id, p.id).startsWith('<main>'),
      true
    );
    store.update(p.id, (current) => {
      const job = current.jobs.at(-1)!;
      job.status = 'running';
      job.threadId = 'empty-job';
      job.emptyOutputAt = null;
    });
    await until(() => Boolean(store.get(p.id).jobs.at(-1)?.emptyOutputAt));
    assert.equal(
      store.get(p.id).jobs.at(-1)?.status,
      'running',
      'Give final output time to settle'
    );
    store.update(p.id, (current) => {
      current.jobs.at(-1)!.emptyOutputAt = '2000-01-01T00:00:00.000Z';
    });
    await until(() => store.get(p.id).jobs.at(-1)?.status === 'failed');
    assert.match(store.get(p.id).jobs.at(-1)!.error!, /without an artifact/);
  } finally {
    controller.abort();
    await running;
    db.close();
  }
});

test('old preparations remain discoverable and every pending record is reconciled beyond presentation limits', async () => {
  const { preparationStore } = await import('../preparation/store.ts');
  const db = new Database(':memory:');
  const store = preparationStore({ storage: { database: () => db } } as any);
  const at = new Date().toISOString();
  const brief = {
    revision: 0,
    title: 'Brief',
    description: '',
    author: 'request',
    at
  };
  const base: any = {
    id: 'old',
    projectId: 'project',
    request: 'Request',
    createdAt: at,
    updatedAt: at,
    threadId: 'old-thread',
    environmentId: null,
    hostId: null,
    execution: null,
    context: null,
    artifactRoot: null,
    brief,
    history: [],
    proposals: [],
    messages: [],
    jobs: [],
    versions: [],
    selection: null,
    ready: false,
    linkedTask: null,
    error: null
  };
  try {
    for (let i = 0; i < 330; i++)
      store.put({
        ...base,
        id: 'pending-' + String(i).padStart(3, '0'),
        threadId: i === 0 ? 'old-thread' : 'thread-' + i,
        jobs: [
          {
            id: 'job-' + i,
            kind: 'brief',
            status: 'running',
            threadId: 'agent-' + i,
            brief,
            direction: '',
            alternativeId: null,
            parentVersionId: null,
            error: null,
            at,
            finishedAt: null
          }
        ]
      });
    db.prepare('UPDATE preparations SET updated_at=? WHERE id=?').run(
      '2000-01-01T00:00:00Z',
      'pending-000'
    );
    assert.equal(store.project('project').length, 300);
    assert.equal(store.forThread('old-thread', 'project')?.id, 'pending-000');
    assert.equal(store.forThread('old-thread', 'another-project'), null);
    let count = 0;
    for (const p of store.pending()) {
      count++;
      store.update(p.id, (current) => {
        current.jobs[0]!.status = 'succeeded';
      });
    }
    assert.equal(count, 330);
    assert.equal([...store.pending()].length, 0);
  } finally {
    db.close();
  }
});

test('deferred preparation responses cannot cross selection identity or undo a mutation', async () => {
  const { preparationRequestGate } = await import(
    '../preparation/request-gate.ts'
  );
  const gate = preparationRequestGate();
  const a = { id: 'a', projectId: 'project', description: 'A content' };
  const b = { id: 'b', projectId: 'project', description: 'B content' };
  let displayed: typeof a | null = null;
  let resolveA!: (value: typeof a) => void;
  let resolveB!: (value: typeof a) => void;
  const deferredA = new Promise<typeof a>((resolve) => {
    resolveA = resolve;
  });
  const deferredB = new Promise<typeof a>((resolve) => {
    resolveB = resolve;
  });
  const acceptA = gate.begin(a);
  const pendingA = deferredA.then((value) => {
    if (acceptA(value)) displayed = value;
  });
  const acceptB = gate.begin(b);
  const pendingB = deferredB.then((value) => {
    if (acceptB(value)) displayed = value;
  });
  resolveB(b);
  await pendingB;
  resolveA(a);
  await pendingA;
  assert.deepEqual(displayed, b, 'Late A cannot populate B editor');
  assert.equal(
    acceptB({ ...b, projectId: 'other' }),
    false,
    'Reject wrong project response'
  );
  const acceptOldRead = gate.begin(b);
  gate.invalidate();
  assert.equal(
    acceptOldRead(b),
    false,
    'A completed mutation invalidates earlier reads'
  );
  const acceptBeforeUnmount = gate.begin(b);
  gate.invalidate();
  assert.equal(
    acceptBeforeUnmount(b),
    false,
    'Unmount invalidates pending reads'
  );
});
