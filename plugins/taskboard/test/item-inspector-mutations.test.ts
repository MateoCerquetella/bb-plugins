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

const { createLinearAdapter } = await import('../sources/linear.ts');

type LinearRequest = {
  query: string;
  variables: Record<string, unknown>;
};

async function withMockFetch<T>(
  handler: (request: LinearRequest) => unknown,
  run: () => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as LinearRequest;
    return Response.json({ data: handler(request) });
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

function linearIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-1',
    identifier: 'BAN-152',
    title: 'Verify responsive layout',
    description: 'Check every page.',
    url: 'https://linear.app/roten/issue/BAN-152',
    priority: 2,
    priorityLabel: 'High',
    updatedAt: '2026-10-20T12:00:00.000Z',
    state: { id: 'state-todo', name: 'Todo', type: 'unstarted' },
    assignee: { id: 'user-mr', name: 'mateo rodriguez' },
    team: { key: 'BAN', name: 'Bananito' },
    project: { id: 'project-roten', name: 'Roten Market' },
    labels: { nodes: [] },
    ...overrides
  };
}

function inspectorIssue() {
  return {
    id: 'issue-1',
    priority: 2,
    assignee: { id: 'user-mr' },
    project: { id: 'project-roten' },
    team: {
      key: 'BAN',
      members: {
        nodes: [
          { id: 'user-mr', name: 'mateo rodriguez' },
          { id: 'user-ada', name: 'Ada Lovelace' }
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      },
      projects: {
        nodes: [
          { id: 'project-roten', name: 'Roten Market' },
          { id: 'project-store', name: 'Storefront' }
        ],
        pageInfo: { hasNextPage: false, endCursor: null }
      }
    }
  };
}

test('Linear exposes every inspector option including explicit empty choices', async () => {
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'BAN',
    finishedDays: 0
  });

  const result = await withMockFetch(
    request => {
      assert.match(request.query, /TaskboardLinearInspectorOptions/u);
      assert.deepEqual(request.variables, { id: 'issue-1' });
      return { issue: inspectorIssue() };
    },
    () => adapter.inspectorOptions!('issue-1')
  );

  assert.deepEqual(result.priority.options, [
    { id: null, label: 'No priority', current: false },
    { id: '1', label: 'Urgent', current: false },
    { id: '2', label: 'High', current: true },
    { id: '3', label: 'Medium', current: false },
    { id: '4', label: 'Low', current: false }
  ]);
  assert.deepEqual(result.assignee.options, [
    { id: null, label: 'Unassigned', current: false },
    { id: 'user-mr', label: 'mateo rodriguez', current: true },
    { id: 'user-ada', label: 'Ada Lovelace', current: false }
  ]);
  assert.deepEqual(result.project.options, [
    { id: null, label: 'No project', current: false },
    { id: 'project-roten', label: 'Roten Market', current: true },
    { id: 'project-store', label: 'Storefront', current: false }
  ]);
  assert.deepEqual(result.comments, { supported: true });
});

test('Linear field mutations send provider-native values and return refreshed detail', async () => {
  const requests: LinearRequest[] = [];
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'BAN',
    finishedDays: 0
  });
  let updateInput: Record<string, unknown> | null = null;

  await withMockFetch(
    request => {
      requests.push(request);
      if (request.query.includes('TaskboardLinearInspectorOptions')) {
        return { issue: inspectorIssue() };
      }
      if (request.query.includes('TaskboardLinearUpdateField')) {
        updateInput = request.variables.input as Record<string, unknown>;
        return {
          issueUpdate: {
            success: true,
            issue: linearIssue(
              updateInput && 'priority' in updateInput
                ? { priority: 0, priorityLabel: '' }
                : updateInput && 'assigneeId' in updateInput
                  ? { assignee: null }
                  : { project: null }
            )
          }
        };
      }
      throw new Error(`Unexpected Linear request: ${request.query}`);
    },
    async () => {
      const noPriority = await adapter.updateField!('issue-1', {
        field: 'priority',
        optionId: null
      });
      assert.equal(noPriority.priority, null);
      assert.deepEqual(updateInput, { priority: 0 });

      const unassigned = await adapter.updateField!('issue-1', {
        field: 'assignee',
        optionId: null
      });
      assert.equal(unassigned.assignee, null);
      assert.deepEqual(updateInput, { assigneeId: null });

      const noProject = await adapter.updateField!('issue-1', {
        field: 'project',
        optionId: null
      });
      assert.equal(noProject.project, null);
      assert.deepEqual(updateInput, { projectId: null });
    }
  );

  assert.equal(
    requests.filter(request =>
      request.query.includes('TaskboardLinearUpdateField')
    ).length,
    3
  );
});

test('Linear comments validate scope, persist the trimmed body, and reload the thread', async () => {
  const requests: LinearRequest[] = [];
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'BAN',
    finishedDays: 0
  });
  let detailLoads = 0;

  const detail = await withMockFetch(
    request => {
      requests.push(request);
      if (request.query.includes('TaskboardLinearIssue')) {
        detailLoads += 1;
        return {
          issue: linearIssue({
            comments: {
              nodes:
                detailLoads === 1
                  ? []
                  : [
                      {
                        body: 'Ready for review.',
                        createdAt: '2026-10-20T12:05:00.000Z',
                        user: { name: 'mateo rodriguez' }
                      }
                    ]
            }
          })
        };
      }
      if (request.query.includes('TaskboardLinearCreateComment')) {
        return {
          commentCreate: {
            success: true,
            comment: {
              id: 'comment-1',
              issue: { id: 'issue-1', team: { key: 'BAN' } }
            }
          }
        };
      }
      throw new Error(`Unexpected Linear request: ${request.query}`);
    },
    () => adapter.addComment!('issue-1', '  Ready for review.  ')
  );

  const mutation = requests.find(request =>
    request.query.includes('TaskboardLinearCreateComment')
  );
  assert.deepEqual(mutation?.variables, {
    input: { issueId: 'issue-1', body: 'Ready for review.' }
  });
  assert.equal(detailLoads, 2);
  assert.deepEqual(detail.comments, [
    {
      author: 'mateo rodriguez',
      body: 'Ready for review.',
      createdAt: '2026-10-20T12:05:00.000Z'
    }
  ]);
});
