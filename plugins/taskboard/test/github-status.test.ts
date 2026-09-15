import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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

const { createGithubAdapter } = await import('../sources/github.ts');

function fixture(statusOverrides: Record<string, unknown>) {
  const calls: string[] = [];
  const bb = {
    sdk: {
      plugins: {
        async callRpc(input: {
          pluginId: string;
          method: string;
          input: unknown;
          outputSchema: { parse(value: unknown): unknown };
        }) {
          assert.equal(input.pluginId, 'github');
          calls.push(input.method);
          let response: unknown;
          switch (input.method) {
            case 'refresh':
              response = { repos: 2, items: 1 };
              break;
            case 'status':
              response = {
                ghOk: true,
                ghError: null,
                repos: [
                  { repo: 'acme/repo', projectId: 'proj_taskboard' },
                  { repo: 'other/repo', projectId: 'proj_other' }
                ],
                lastSyncedAt: null,
                ...statusOverrides
              };
              break;
            case 'listItems':
              assert.deepEqual(input.input, { kind: 'issue', repo: 'acme/repo' });
              response = {
                items: [{
                  repo: 'acme/repo',
                  number: 42,
                  kind: 'issue',
                  title: 'An existing open issue',
                  state: 'OPEN',
                  author: 'octocat',
                  labels: [],
                  assignees: [],
                  url: 'https://github.com/acme/repo/issues/42',
                  body: '',
                  updatedAt: '2026-09-15T12:00:00.000Z'
                }]
              };
              break;
            default:
              throw new Error(`Unexpected GitHub RPC: ${input.method}`);
          }
          // The real SDK validates the response against the caller's schema.
          return input.outputSchema.parse(response);
        }
      }
    }
  };
  return {
    adapter: createGithubAdapter(bb as never, true, 'proj_taskboard'),
    calls
  };
}

for (const [version, status] of [
  ['current', { ghState: 'ready' }],
  ['legacy', {}]
] as const) {
  test(`GitHub loads mapped project issues with ${version} status responses`, async () => {
    const { adapter, calls } = fixture(status);
    const items = await adapter.list({ refresh: true });
    assert.deepEqual(calls, ['refresh', 'status', 'listItems']);
    assert.deepEqual(items.map(item => [item.locator, item.stateCategory]), [
      ['acme/repo#42', 'todo']
    ]);
  });
}

for (const ghState of ['needs_configuration', 'unavailable']) {
  test(`GitHub preserves the provider error when ${ghState}`, async () => {
    const { adapter, calls } = fixture({
      ghState,
      ghOk: false,
      ghError: 'GitHub connection needs attention'
    });
    await assert.rejects(adapter.list(), {
      message: 'GitHub connection needs attention'
    });
    assert.deepEqual(calls, ['status']);
  });
}

test('GitHub still rejects malformed required status fields', async () => {
  const { adapter, calls } = fixture({ ghState: 'ready', ghOk: 'true' });
  await assert.rejects(adapter.list(), /expected boolean/);
  assert.deepEqual(calls, ['status']);
});
