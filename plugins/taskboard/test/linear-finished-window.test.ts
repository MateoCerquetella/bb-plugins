import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const sourceUrl = new URL(
        `${specifier.slice(0, -'.js'.length)}.ts`,
        context.parentURL
      );
      if (existsSync(fileURLToPath(sourceUrl))) {
        return { shortCircuit: true, url: sourceUrl.href };
      }
    }
    return nextResolve(specifier, context);
  }
});

const { createLinearAdapter } = await import('../sources/linear.ts');
const { projectSourceConfigSchema } = await import('../contract.ts');
const { createWorkItemStore } = await import('../store.ts');
const { parseTaskboardCliArguments } = await import('../server.ts');
type StoreBb = Parameters<typeof createWorkItemStore>[0];

async function listQueries(finishedDays: number) {
  const requests: Array<{ query: string; variables: Record<string, unknown> }> =
    [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        data: {
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  try {
    await createLinearAdapter({
      enabled: true,
      apiKey: 'linear-token',
      teamKey: 'ENG',
      finishedDays
    }).list();
  } finally {
    globalThis.fetch = original;
  }
  return requests;
}

test('Linear sync excludes finished issues when the window is off', async () => {
  const [request] = await listQueries(0);
  assert.match(request!.query, /nin: \["completed", "canceled"\]/u);
  assert.doesNotMatch(request!.query, /completedAt/u);
  assert.equal('finishedSince' in request!.variables, false);
});

test('Linear sync includes issues finished within the window', async () => {
  const [request] = await listQueries(30);
  assert.match(request!.query, /completedAt: \{ gte: \$finishedSince \}/u);
  assert.match(request!.query, /canceledAt: \{ gte: \$finishedSince \}/u);
  assert.equal(request!.variables.finishedSince, '-P30D');
});

test('finished window is a bounded whole number of days', () => {
  const base = {
    projectId: 'proj_alpha',
    source: 'linear',
    linearTeamKey: 'ENG',
    jiraBaseUrl: '',
    jiraEmail: '',
    jiraJql: 'order by updated',
    gitlabProjectRef: ''
  };
  for (const linearFinishedDays of [0, 30, 365]) {
    assert.ok(
      projectSourceConfigSchema.safeParse({ ...base, linearFinishedDays })
        .success
    );
  }
  for (const linearFinishedDays of [-1, 1.5, 366]) {
    assert.equal(
      projectSourceConfigSchema.safeParse({ ...base, linearFinishedDays })
        .success,
      false
    );
  }
});

test('CLI parses --linear-finished-days as days', () => {
  assert.equal(
    parseTaskboardCliArguments('config', ['--linear-finished-days', '30'])
      .linearFinishedDays,
    30
  );
  for (const value of ['-1', '1.5', 'abc', '366', '']) {
    assert.throws(() =>
      parseTaskboardCliArguments('config', ['--linear-finished-days', value])
    );
  }
});

test('store defaults existing projects to no finished window and persists it', () => {
  const db = new Database(':memory:');
  try {
    const bb = {
      storage: {
        database: () => db,
        migrate(database: Database.Database, migrations: readonly string[]) {
          for (const migration of migrations) database.exec(migration);
        }
      }
    } as unknown as StoreBb;
    const store = createWorkItemStore(bb);
    const defaults = {
      source: 'linear' as const,
      linearTeamKey: 'ENG',
      linearFinishedDays: 0,
      jiraBaseUrl: '',
      jiraEmail: '',
      jiraJql: 'order by updated',
      gitlabProjectRef: ''
    };
    const ensured = store.ensureProjectConfig('proj_alpha', defaults);
    assert.equal(ensured.linearFinishedDays, 0);
    const saved = store.saveProjectConfig({
      ...ensured,
      linearFinishedDays: 30
    });
    assert.equal(saved.linearFinishedDays, 30);
  } finally {
    db.close();
  }
});
