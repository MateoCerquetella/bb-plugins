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

const [{ createGithubAdapter }, { createJiraAdapter }, { createLinearAdapter }] =
  await Promise.all([
    import('../sources/github.ts'),
    import('../sources/jira.ts'),
    import('../sources/linear.ts')
  ]);

const fullCreateInput = {
  title: 'Native creation fields',
  description: 'Create the issue with provider-native metadata.',
  destinationId: 'ENG',
  issueType: null,
  statusId: null,
  assigneeId: null,
  priorityId: null,
  labelIds: [],
  dueDate: null,
  milestoneId: null
};

async function withMockFetch<T>(
  handler: (url: string, init: RequestInit | undefined) => unknown,
  run: () => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    new Response(JSON.stringify(handler(String(input), init)), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

function linearIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-1',
    identifier: 'ENG-1',
    title: 'Native creation fields',
    description: 'Create the issue with provider-native metadata.',
    url: 'https://linear.app/example/issue/ENG-1',
    priorityLabel: 'High',
    updatedAt: '2026-08-26T12:00:00.000Z',
    state: { id: 'state-started', name: 'In Progress', type: 'started' },
    assignee: { id: 'user-1', name: 'Mateo' },
    team: { key: 'ENG', name: 'Engineering' },
    project: null,
    labels: { nodes: [{ name: 'Bug' }] },
    ...overrides
  };
}

test('Linear maps native metadata and sends it in IssueCreateInput', async () => {
  const requests: Array<{ query: string; variables: Record<string, unknown> }> =
    [];
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'ENG'
  });

  await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      requests.push(body);
      if (body.query.includes('TaskboardLinearCreateMetadata')) {
        return {
          data: {
            teams: {
              nodes: [
                {
                  id: 'team-1',
                  key: 'ENG',
                  name: 'Engineering',
                  states: {
                    nodes: [
                      { id: 'state-backlog', name: 'Backlog', type: 'backlog' },
                      {
                        id: 'state-todo',
                        name: 'Todo',
                        type: 'unstarted'
                      }
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  },
                  members: {
                    nodes: [{ id: 'user-1', name: 'Mateo' }],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  },
                  labels: {
                    nodes: [{ id: 'label-1', name: 'Bug' }],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  }
                }
              ]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return {
          data: { issueCreate: { success: true, issue: linearIssue() } }
        };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    async () => {
      const metadata = await adapter.createMetadata({
        destinationId: 'eng',
        issueType: null
      });
      assert.equal(metadata.defaultStatusId, null);
      assert.deepEqual(metadata.assigneeOptions, [
        { id: 'user-1', label: 'Mateo' }
      ]);
      assert.deepEqual(metadata.labelOptions, [
        { id: 'label-1', label: 'Bug' }
      ]);
      assert.equal(metadata.supportsDueDate, true);

      const result = await adapter.create({
        ...fullCreateInput,
        statusId: 'state-started',
        assigneeId: 'user-1',
        priorityId: '2',
        labelIds: ['label-1'],
        dueDate: '2026-09-04'
      });
      assert.equal(result.item.key, 'ENG-1');
      assert.deepEqual(result.warnings, []);
      assert.deepEqual(result.assigneeConfirmation, {
        confirmed: true,
        id: 'user-1'
      });
    }
  );

  const mutation = requests.find(request =>
    request.query.includes('TaskboardLinearCreateIssue')
  );
  assert.match(mutation?.query ?? '', /labels\(first: 100\)/u);
  assert.deepEqual(mutation?.variables.input, {
    teamId: 'team-1',
    title: fullCreateInput.title,
    description: fullCreateInput.description,
    stateId: 'state-started',
    assigneeId: 'user-1',
    priority: 2,
    labelIds: ['label-1'],
    dueDate: '2026-09-04'
  });
});

test('Linear paginates create options independently and preserves the native default state', async () => {
  const requests: Array<{ query: string; variables: Record<string, unknown> }> =
    [];
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'ENG'
  });

  await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      requests.push(body);
      if (body.query.includes('TaskboardLinearCreateMetadata')) {
        const statesAfter = body.variables.statesAfter;
        const membersAfter = body.variables.membersAfter;
        const labelsAfter = body.variables.labelsAfter;
        return {
          data: {
            teams: {
              nodes: [
                {
                  id: 'team-1',
                  key: 'ENG',
                  name: 'Engineering',
                  states:
                    statesAfter === 'states-1'
                      ? {
                          nodes: [
                            {
                              id: 'state-started',
                              name: 'In Progress',
                              type: 'started'
                            }
                          ],
                          pageInfo: { hasNextPage: false, endCursor: null }
                        }
                      : {
                          nodes: [
                            {
                              id: 'state-todo',
                              name: 'Todo',
                              type: 'unstarted'
                            }
                          ],
                          pageInfo: {
                            hasNextPage: true,
                            endCursor: 'states-1'
                          }
                        },
                  members:
                    membersAfter === 'members-2'
                      ? {
                          nodes: [{ id: 'user-3', name: 'Grace' }],
                          pageInfo: { hasNextPage: false, endCursor: null }
                        }
                      : membersAfter === 'members-1'
                        ? {
                            nodes: [{ id: 'user-2', name: 'Ada' }],
                            pageInfo: {
                              hasNextPage: true,
                              endCursor: 'members-2'
                            }
                          }
                        : {
                            nodes: [{ id: 'user-1', name: 'Mateo' }],
                            pageInfo: {
                              hasNextPage: true,
                              endCursor: 'members-1'
                            }
                          },
                  labels:
                    labelsAfter === 'labels-1'
                      ? {
                          nodes: [{ id: 'label-2', name: 'Release' }],
                          pageInfo: { hasNextPage: false, endCursor: null }
                        }
                      : {
                          nodes: [{ id: 'label-1', name: 'Bug' }],
                          pageInfo: {
                            hasNextPage: true,
                            endCursor: 'labels-1'
                          }
                        }
                }
              ]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return {
          data: {
            issueCreate: {
              success: true,
              issue: linearIssue({
                state: { id: 'state-todo', name: 'Todo', type: 'unstarted' }
              })
            }
          }
        };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    async () => {
      const metadata = await adapter.createMetadata({
        destinationId: 'ENG',
        issueType: null
      });
      assert.equal(metadata.defaultStatusId, null);
      assert.deepEqual(metadata.statusOptions, [
        { id: 'state-todo', label: 'Todo' },
        { id: 'state-started', label: 'In Progress' }
      ]);
      assert.deepEqual(metadata.assigneeOptions, [
        { id: 'user-1', label: 'Mateo' },
        { id: 'user-2', label: 'Ada' },
        { id: 'user-3', label: 'Grace' }
      ]);
      assert.deepEqual(metadata.labelOptions, [
        { id: 'label-1', label: 'Bug' },
        { id: 'label-2', label: 'Release' }
      ]);

      await adapter.create(fullCreateInput);
    }
  );

  const metadataRequests = requests.filter(request =>
    request.query.includes('TaskboardLinearCreateMetadata')
  );
  assert.deepEqual(
    metadataRequests.map(request => request.variables),
    [
      { teamKey: 'ENG' },
      {
        teamKey: 'ENG',
        statesAfter: 'states-1',
        membersAfter: 'members-1',
        labelsAfter: 'labels-1'
      },
      {
        teamKey: 'ENG',
        statesAfter: 'states-1',
        membersAfter: 'members-2',
        labelsAfter: 'labels-1'
      }
    ]
  );
  const mutation = requests.find(request =>
    request.query.includes('TaskboardLinearCreateIssue')
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(mutation?.variables.input, 'stateId'),
    false
  );
});

test('Linear rejects invalid creation metadata cursors', async () => {
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'ENG'
  });
  await assert.rejects(
    () =>
      withMockFetch(
        () => ({
          data: {
            teams: {
              nodes: [
                {
                  id: 'team-1',
                  key: 'ENG',
                  name: 'Engineering',
                  states: {
                    nodes: [],
                    pageInfo: { hasNextPage: true, endCursor: null }
                  },
                  members: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  },
                  labels: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  }
                }
              ]
            }
          }
        }),
        () =>
          adapter.createMetadata({ destinationId: 'ENG', issueType: null })
      ),
    /invalid states pagination cursor/u
  );
});

test('Linear keeps explicit create rejection retryable without the uncertain marker', async () => {
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'ENG'
  });

  await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return { data: { issueCreate: { success: false, issue: null } } };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    () =>
      assert.rejects(
        adapter.create(fullCreateInput),
        error =>
          error instanceof Error &&
          /Linear rejected the new issue/u.test(error.message) &&
          !/TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u.test(error.message)
      )
  );

  await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return { data: { issueCreate: { success: false } } };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    () =>
      assert.rejects(
        adapter.create(fullCreateInput),
        error =>
          error instanceof Error &&
          /Linear rejected the new issue/u.test(error.message) &&
          !/TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u.test(error.message)
      )
  );

  await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return {
          data: { issueCreate: { success: false, issue: linearIssue() } }
        };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    () =>
      assert.rejects(
        adapter.create(fullCreateInput),
        /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
      )
  );
});

test('Linear marks malformed or lost post-dispatch create responses uncertain', async () => {
  const adapter = createLinearAdapter({
    enabled: true,
    apiKey: 'linear-token',
    teamKey: 'ENG'
  });

  await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return { data: { issueCreate: { success: true, issue: {} } } };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    () =>
      assert.rejects(
        adapter.create(fullCreateInput),
        /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
      )
  );

  await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return {
          data: {
            issueCreate: {
              success: true,
              issue: linearIssue({
                team: { key: 'OPS', name: 'Operations' }
              })
            }
          }
        };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    () =>
      assert.rejects(
        adapter.create(fullCreateInput),
        /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
      )
  );

  for (const transportError of [
    new Error('response lost after dispatch'),
    new DOMException('request aborted', 'AbortError'),
    new DOMException('request timed out', 'TimeoutError')
  ]) {
    const originalFetch = globalThis.fetch;
    let createDispatched = false;
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return new Response(
          JSON.stringify({
            data: {
              teams: {
                nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
              }
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        createDispatched = true;
        throw transportError;
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    };
    try {
      await assert.rejects(
        adapter.create(fullCreateInput),
        /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
      );
      assert.equal(createDispatched, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const unassigned = await withMockFetch(
    (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes('TaskboardLinearCreateTeam')) {
        return {
          data: {
            teams: {
              nodes: [{ id: 'team-1', key: 'ENG', name: 'Engineering' }]
            }
          }
        };
      }
      if (body.query.includes('TaskboardLinearCreateIssue')) {
        return {
          data: {
            issueCreate: {
              success: true,
              issue: linearIssue({ assignee: null })
            }
          }
        };
      }
      throw new Error(`Unexpected Linear request: ${body.query}`);
    },
    () => adapter.create(fullCreateInput)
  );
  assert.deepEqual(unassigned.assigneeConfirmation, {
    confirmed: true,
    id: null
  });
});

test('Jira derives native fields from createmeta and forwards selections', async () => {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const adapter = createJiraAdapter({
    enabled: true,
    baseUrl: 'https://example.atlassian.net',
    email: 'mateo@example.com',
    apiToken: 'jira-token',
    jql: 'project = ENG'
  });

  await withMockFetch(
    (url, init) => {
      requests.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      if (url.includes('/issuetypes?')) {
        return {
          startAt: 0,
          maxResults: 200,
          total: 2,
          issueTypes: [
            { id: '10001', name: 'Task', subtask: false },
            { id: '10002', name: 'Subtask', subtask: true }
          ]
        };
      }
      if (url.includes('/issuetypes/10001?')) {
        return {
          startAt: 0,
          maxResults: 200,
          total: 4,
          fields: [
            {
              fieldId: 'assignee',
              allowedValues: [
                { accountId: 'user-1', displayName: 'Mateo', active: true },
                { accountId: 'user-2', displayName: 'Inactive', active: false }
              ]
            },
            {
              fieldId: 'priority',
              allowedValues: [{ id: '2', name: 'High' }]
            },
            { fieldId: 'labels' },
            { fieldId: 'duedate' }
          ]
        };
      }
      if (url.includes('/rest/api/3/label?')) {
        return {
          startAt: 0,
          maxResults: 1000,
          total: 2,
          isLast: true,
          values: ['bug', 'release']
        };
      }
      if (url.includes('/rest/api/3/user/assignable/search?')) {
        return [];
      }
      if (url.endsWith('/rest/api/3/issue') && init?.method === 'POST') {
        return { id: '101', key: 'ENG-101' };
      }
      if (url.includes('/rest/api/3/issue/ENG-101?')) {
        return {
          id: '101',
          key: 'ENG-101',
          fields: {
            summary: fullCreateInput.title,
            description: null,
            updated: '2026-08-26T12:00:00.000Z',
            status: {
              id: 'todo',
              name: 'Todo',
              statusCategory: { key: 'new' }
            },
            priority: { name: 'High' },
            assignee: { accountId: 'user-1', displayName: 'Mateo' },
            project: { key: 'ENG', name: 'Engineering' },
            labels: ['bug']
          }
        };
      }
      throw new Error(`Unexpected Jira request: ${url}`);
    },
    async () => {
      const metadata = await adapter.createMetadata({
        destinationId: 'eng',
        issueType: 'Task'
      });
      assert.deepEqual(metadata.assigneeOptions, [
        { id: 'user-1', label: 'Mateo' }
      ]);
      assert.deepEqual(metadata.priorityOptions, [{ id: '2', label: 'High' }]);
      assert.deepEqual(metadata.labelOptions, [
        { id: 'bug', label: 'bug' },
        { id: 'release', label: 'release' }
      ]);
      assert.deepEqual(metadata.issueTypeOptions, [
        { id: '10001', label: 'Task' }
      ]);
      assert.equal(metadata.defaultIssueTypeId, '10001');
      assert.equal(metadata.supportsDueDate, true);

      const result = await adapter.create({
        ...fullCreateInput,
        issueType: '10001',
        assigneeId: 'user-1',
        priorityId: '2',
        labelIds: ['bug'],
        dueDate: '2026-09-04'
      });
      assert.equal(result.item.key, 'ENG-101');
      assert.deepEqual(result.warnings, []);
      assert.deepEqual(result.assigneeConfirmation, {
        confirmed: true,
        id: 'user-1'
      });
    }
  );

  const create = requests.find(
    request =>
      request.url.endsWith('/rest/api/3/issue') && request.method === 'POST'
  );
  assert.deepEqual(create?.body, {
    fields: {
      project: { key: 'ENG' },
      summary: fullCreateInput.title,
      issuetype: { id: '10001' },
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: fullCreateInput.description }
            ]
          }
        ]
      },
      assignee: { accountId: 'user-1' },
      priority: { id: '2' },
      labels: ['bug'],
      duedate: '2026-09-04'
    }
  });
});

test('Jira marks ambiguous create acknowledgement and detail failures uncertain', async () => {
  const adapter = createJiraAdapter({
    enabled: true,
    baseUrl: 'https://example.atlassian.net',
    email: 'mateo@example.com',
    apiToken: 'jira-token',
    jql: 'project = ENG'
  });
  const createInput = {
    ...fullCreateInput,
    issueType: '10001'
  };
  const jiraDetail = (options: {
    id: string;
    key: string;
    projectKey?: string;
    assignee?: { accountId?: string; displayName: string } | null;
  }) => ({
    id: options.id,
    key: options.key,
    fields: {
      summary: fullCreateInput.title,
      description: null,
      updated: '2026-08-26T12:00:00.000Z',
      status: {
        id: 'todo',
        name: 'Todo',
        statusCategory: { key: 'new' }
      },
      priority: null,
      assignee: options.assignee ?? null,
      project: {
        key: options.projectKey ?? 'ENG',
        name: 'Engineering'
      },
      labels: []
    }
  });

  for (const transportError of [
    new Error('response lost after dispatch'),
    new DOMException('request aborted', 'AbortError'),
    new DOMException('request timed out', 'TimeoutError')
  ]) {
    const originalFetch = globalThis.fetch;
    let createDispatched = false;
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.method, 'POST');
      createDispatched = true;
      throw transportError;
    };
    try {
      await assert.rejects(
        adapter.create(createInput),
        /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
      );
      assert.equal(createDispatched, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  await withMockFetch(
    (url, init) => {
      if (url.endsWith('/rest/api/3/issue') && init?.method === 'POST') {
        return { accepted: true };
      }
      throw new Error(`Unexpected Jira request: ${url}`);
    },
    () =>
      assert.rejects(
        adapter.create(createInput),
        /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
      )
  );

  await withMockFetch(
    (url, init) => {
      if (url.endsWith('/rest/api/3/issue') && init?.method === 'POST') {
        return { id: '101', key: 'ENG-101' };
      }
      if (url.includes('/rest/api/3/issue/ENG-101?')) {
        return { unavailable: true };
      }
      throw new Error(`Unexpected Jira request: ${url}`);
    },
    () =>
      assert.rejects(
        adapter.create(createInput),
        error =>
          error instanceof Error &&
          /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u.test(error.message) &&
          /ENG-101/u.test(error.message)
      )
  );

  for (const detailFailure of [
    {
      created: { id: '103', key: 'ENG-103' },
      detail: jiraDetail({ id: '999', key: 'ENG-103' })
    },
    {
      created: { id: '104', key: 'ENG-104' },
      detail: jiraDetail({
        id: '104',
        key: 'ENG-104',
        projectKey: 'OPS'
      })
    }
  ]) {
    await withMockFetch(
      (url, init) => {
        if (url.endsWith('/rest/api/3/issue') && init?.method === 'POST') {
          return detailFailure.created;
        }
        if (
          url.includes(
            `/rest/api/3/issue/${detailFailure.created.key}?`
          )
        ) {
          return detailFailure.detail;
        }
        throw new Error(`Unexpected Jira request: ${url}`);
      },
      () =>
        assert.rejects(
          adapter.create(createInput),
          /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
        )
    );
  }

  for (const transportError of [
    new DOMException('detail aborted', 'AbortError'),
    new DOMException('detail timed out', 'TimeoutError')
  ]) {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ id: '105', key: 'ENG-105' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      throw transportError;
    };
    try {
      await assert.rejects(
        adapter.create(createInput),
        /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
      );
      assert.equal(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const result = await withMockFetch(
    (url, init) => {
      if (url.endsWith('/rest/api/3/issue') && init?.method === 'POST') {
        return { id: '102', key: 'ENG-102' };
      }
      if (url.includes('/rest/api/3/issue/ENG-102?')) {
        return {
          id: '102',
          key: 'ENG-102',
          fields: {
            summary: fullCreateInput.title,
            description: null,
            updated: '2026-08-26T12:00:00.000Z',
            status: {
              id: 'todo',
              name: 'Todo',
              statusCategory: { key: 'new' }
            },
            priority: null,
            assignee: { displayName: 'Identity unavailable' },
            project: { key: 'ENG', name: 'Engineering' },
            labels: []
          }
        };
      }
      throw new Error(`Unexpected Jira request: ${url}`);
    },
    () => adapter.create(createInput)
  );
  assert.equal(result.item.assignee, 'Identity unavailable');
  assert.deepEqual(result.assigneeConfirmation, { confirmed: false });

  const unassigned = await withMockFetch(
    (url, init) => {
      if (url.endsWith('/rest/api/3/issue') && init?.method === 'POST') {
        return { id: '106', key: 'ENG-106' };
      }
      if (url.includes('/rest/api/3/issue/ENG-106?')) {
        return jiraDetail({ id: '106', key: 'ENG-106', assignee: null });
      }
      throw new Error(`Unexpected Jira request: ${url}`);
    },
    () => adapter.create(createInput)
  );
  assert.deepEqual(unassigned.assigneeConfirmation, {
    confirmed: true,
    id: null
  });
});

test('Jira paginates create metadata and canonicalizes issue types to native IDs', async () => {
  const urls: string[] = [];
  const adapter = createJiraAdapter({
    enabled: true,
    baseUrl: 'https://example.atlassian.net',
    email: 'mateo@example.com',
    apiToken: 'jira-token',
    jql: 'project = ENG'
  });

  const metadata = await withMockFetch(
    url => {
      urls.push(url);
      const parsed = new URL(url);
      const startAt = Number(parsed.searchParams.get('startAt') ?? '0');
      if (parsed.pathname.endsWith('/issuetypes')) {
        return startAt === 0
          ? {
              startAt: 0,
              maxResults: 1,
              total: 2,
              issueTypes: [{ id: '10000', name: 'Bug', subtask: false }]
            }
          : {
              startAt: 1,
              maxResults: 1,
              total: 2,
              issueTypes: [{ id: '10001', name: 'Task', subtask: false }]
            };
      }
      if (parsed.pathname.endsWith('/issuetypes/10001')) {
        return startAt === 0
          ? {
              startAt: 0,
              maxResults: 2,
              total: 4,
              fields: [
                {
                  fieldId: 'assignee',
                  allowedValues: [
                    {
                      accountId: 'user-1',
                      displayName: 'Mateo',
                      active: true
                    }
                  ]
                },
                {
                  fieldId: 'priority',
                  allowedValues: [{ id: '2', name: 'High' }]
                }
              ]
            }
          : {
              startAt: 2,
              maxResults: 2,
              total: 4,
              fields: [{ fieldId: 'labels' }, { fieldId: 'duedate' }]
            };
      }
      if (parsed.pathname.endsWith('/user/assignable/search')) {
        return [
          { accountId: 'user-2', displayName: 'Ada', active: true }
        ];
      }
      if (parsed.pathname.endsWith('/label')) {
        return startAt === 0
          ? {
              startAt: 0,
              maxResults: 1,
              total: 2,
              isLast: false,
              values: ['bug']
            }
          : {
              startAt: 1,
              maxResults: 1,
              total: 2,
              isLast: true,
              values: ['release']
            };
      }
      throw new Error(`Unexpected Jira request: ${url}`);
    },
    () =>
      adapter.createMetadata({
        destinationId: 'ENG',
        issueType: 'Task'
      })
  );

  assert.deepEqual(metadata.issueTypeOptions, [
    { id: '10000', label: 'Bug' },
    { id: '10001', label: 'Task' }
  ]);
  assert.equal(metadata.defaultIssueTypeId, '10001');
  assert.deepEqual(metadata.assigneeOptions, [
    { id: 'user-1', label: 'Mateo' },
    { id: 'user-2', label: 'Ada' }
  ]);
  assert.deepEqual(metadata.labelOptions, [
    { id: 'bug', label: 'bug' },
    { id: 'release', label: 'release' }
  ]);
  assert.equal(metadata.supportsDueDate, true);
  assert.ok(
    urls.some(url => url.includes('/issuetypes?startAt=1&maxResults=200'))
  );
  assert.ok(
    urls.some(url =>
      url.includes('/issuetypes/10001?startAt=2&maxResults=200')
    )
  );
  assert.ok(urls.some(url => url.includes('/label?startAt=1&maxResults=1000')));
});

test('Jira exposes only priorities allowed for the selected project and issue type', async () => {
  const adapter = createJiraAdapter({
    enabled: true,
    baseUrl: 'https://example.atlassian.net',
    email: 'mateo@example.com',
    apiToken: 'jira-token',
    jql: 'project = ENG'
  });

  const metadata = await withMockFetch(
    url => {
      if (url.includes('/issuetypes?')) {
        return {
          startAt: 0,
          maxResults: 200,
          total: 1,
          issueTypes: [{ id: '10001', name: 'Task', subtask: false }]
        };
      }
      if (url.includes('/issuetypes/10001?')) {
        return {
          startAt: 0,
          maxResults: 200,
          total: 1,
          fields: [{ fieldId: 'priority', allowedValues: [] }]
        };
      }
      throw new Error(`Unexpected Jira request: ${url}`);
    },
    () => adapter.createMetadata({ destinationId: 'ENG', issueType: '10001' })
  );

  assert.deepEqual(metadata.priorityOptions, []);
});

test('GitHub loads native metadata and reports partially applied fields', async () => {
  const cliCalls: Array<{ args: string[]; timeoutMs: number | undefined }> = [];
  const rpcCalls: string[] = [];
  const bb = {
    sdk: {
      plugins: {
        async callRpc(input: { method: string }) {
          rpcCalls.push(input.method);
          if (input.method === 'status') {
            return {
              ghOk: true,
              ghState: 'ready',
              ghError: null,
              repos: [{ repo: 'acme/repo', projectId: 'proj_taskboard' }],
              lastSyncedAt: null
            };
          }
          if (input.method === 'getIssue') {
            return {
              issue: {
                repo: 'acme/repo',
                number: 42,
                title: fullCreateInput.title,
                state: 'OPEN',
                author: 'mateo',
                labels: ['bug'],
                assignees: [],
                url: 'https://github.com/acme/repo/issues/42',
                body: fullCreateInput.description,
                updatedAt: '2026-08-26T12:00:00.000Z',
                comments: []
              }
            };
          }
          throw new Error(`Unexpected GitHub RPC: ${input.method}`);
        }
      }
    }
  };
  const runGithubCli = async (args: string[], timeoutMs?: number) => {
    cliCalls.push({ args, timeoutMs });
    const endpoint = args[args.length - 1] ?? '';
    if (endpoint.includes('/assignees?')) {
      return JSON.stringify([[{ login: 'mateo' }]]);
    }
    if (endpoint.includes('/labels?')) {
      return JSON.stringify([[{ name: 'bug' }, { name: 'release' }]]);
    }
    if (endpoint.includes('/milestones?')) {
      return JSON.stringify([
        [
          {
            number: 7,
            title: 'September',
            due_on: '2026-09-30T00:00:00Z'
          }
        ]
      ]);
    }
    return JSON.stringify({
      number: 42,
      html_url: 'https://github.com/acme/repo/issues/42',
      assignees: [],
      labels: [{ name: 'bug' }],
      milestone: null
    });
  };
  const adapter = createGithubAdapter(
    bb as never,
    true,
    'proj_taskboard',
    runGithubCli
  );

  const metadata = await adapter.createMetadata({
    destinationId: 'acme/repo',
    issueType: null
  });
  assert.deepEqual(metadata.assigneeOptions, [
    { id: 'mateo', label: '@mateo' }
  ]);
  assert.deepEqual(metadata.labelOptions, [
    { id: 'bug', label: 'bug' },
    { id: 'release', label: 'release' }
  ]);
  assert.deepEqual(metadata.milestoneOptions, [
    { id: '7', label: 'September · 2026-09-30' }
  ]);

  const result = await adapter.create({
    ...fullCreateInput,
    destinationId: 'acme/repo',
    statusId: 'open',
    assigneeId: 'mateo',
    labelIds: ['bug', 'release'],
    milestoneId: '7'
  });
  assert.equal(result.item.key, 'acme/repo#42');
  assert.deepEqual(result.warnings, [
    'GitHub created the issue but could not assign @mateo.',
    'GitHub created the issue without release.',
    'GitHub created the issue but could not attach the selected milestone.'
  ]);
  assert.deepEqual(result.assigneeConfirmation, {
    confirmed: true,
    id: null
  });
  assert.equal(rpcCalls.includes('assignableUsers'), false);
  assert.equal(rpcCalls.includes('repositoryLabels'), false);
  assert.equal(rpcCalls.includes('getIssue'), false);
  assert.deepEqual(
    cliCalls.filter(call => call.args.includes('--paginate')),
    [
      {
        args: [
          'api',
          '--paginate',
          '--slurp',
          'repos/acme/repo/assignees?per_page=100'
        ],
        timeoutMs: 30_000
      },
      {
        args: [
          'api',
          '--paginate',
          '--slurp',
          'repos/acme/repo/labels?per_page=100'
        ],
        timeoutMs: 30_000
      },
      {
        args: [
          'api',
          '--paginate',
          '--slurp',
          'repos/acme/repo/milestones?state=open&per_page=100'
        ],
        timeoutMs: 30_000
      }
    ]
  );
  assert.deepEqual(cliCalls.find(call => call.args.includes('POST')), {
    args: [
      'api',
      '--method',
      'POST',
      'repos/acme/repo/issues',
      '--raw-field',
      `title=${fullCreateInput.title}`,
      '--raw-field',
      `body=${fullCreateInput.description}`,
      '--raw-field',
      'assignees[]=mateo',
      '--raw-field',
      'labels[]=bug',
      '--raw-field',
      'labels[]=release',
      '--field',
      'milestone=7'
    ],
    timeoutMs: 30_000
  });
});

test('GitHub confirms the submitted assignee from native response membership', async () => {
  const bb = {
    sdk: {
      plugins: {
        async callRpc(input: { method: string }) {
          if (input.method === 'status') {
            return {
              ghOk: true,
              ghError: null,
              repos: [{ repo: 'acme/repo', projectId: 'proj_taskboard' }],
              lastSyncedAt: null
            };
          }
          throw new Error(`Unexpected GitHub RPC: ${input.method}`);
        }
      }
    }
  };
  const adapter = createGithubAdapter(
    bb as never,
    true,
    'proj_taskboard',
    async args => {
      assert.ok(args.includes('POST'));
      return JSON.stringify({
        number: 42,
        html_url: 'https://github.com/acme/repo/issues/42',
        assignees: [{ login: 'automation' }, { login: 'mateo' }],
        labels: [],
        milestone: null
      });
    }
  );

  const result = await adapter.create({
    ...fullCreateInput,
    destinationId: 'acme/repo',
    assigneeId: 'mateo'
  });

  assert.deepEqual(result.assigneeConfirmation, {
    confirmed: true,
    id: 'mateo'
  });
  assert.deepEqual(result.warnings, []);

  const missingAssigneesAdapter = createGithubAdapter(
    bb as never,
    true,
    'proj_taskboard',
    async () =>
      JSON.stringify({
        number: 43,
        html_url: 'https://github.com/acme/repo/issues/43',
        labels: [],
        milestone: null
      })
  );
  await assert.rejects(
    missingAssigneesAdapter.create({
      ...fullCreateInput,
      destinationId: 'acme/repo'
    }),
    /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
  );
});

test('GitHub paginates and deduplicates every create metadata collection', async () => {
  const cliCalls: string[][] = [];
  const bb = {
    sdk: {
      plugins: {
        async callRpc(input: { method: string }) {
          if (input.method === 'status') {
            return {
              ghOk: true,
              ghError: null,
              repos: [{ repo: 'acme/repo', projectId: 'proj_taskboard' }],
              lastSyncedAt: null
            };
          }
          throw new Error(`Unexpected GitHub RPC: ${input.method}`);
        }
      }
    }
  };
  const runGithubCli = async (args: string[]) => {
    cliCalls.push(args);
    const endpoint = args[args.length - 1] ?? '';
    if (endpoint.includes('/assignees?')) {
      return JSON.stringify([
        [{ login: 'mateo' }, { login: 'ada' }],
        [{ login: 'MATEO' }, { login: 'grace' }]
      ]);
    }
    if (endpoint.includes('/labels?')) {
      return JSON.stringify([
        [{ name: 'Bug' }, { name: 'release' }],
        [{ name: 'bug' }, { name: 'frontend' }]
      ]);
    }
    if (endpoint.includes('/milestones?')) {
      return JSON.stringify([
        [
          {
            number: 7,
            title: 'September',
            due_on: '2026-09-30T00:00:00Z'
          }
        ],
        [
          { number: 7, title: 'Duplicate September', due_on: null },
          { number: 8, title: 'October', due_on: null }
        ]
      ]);
    }
    throw new Error(`Unexpected GitHub CLI call: ${args.join(' ')}`);
  };
  const adapter = createGithubAdapter(
    bb as never,
    true,
    'proj_taskboard',
    runGithubCli
  );

  const metadata = await adapter.createMetadata({
    destinationId: 'acme/repo',
    issueType: null
  });

  assert.deepEqual(metadata.assigneeOptions, [
    { id: 'mateo', label: '@mateo' },
    { id: 'ada', label: '@ada' },
    { id: 'grace', label: '@grace' }
  ]);
  assert.deepEqual(metadata.labelOptions, [
    { id: 'Bug', label: 'Bug' },
    { id: 'release', label: 'release' },
    { id: 'frontend', label: 'frontend' }
  ]);
  assert.deepEqual(metadata.milestoneOptions, [
    { id: '7', label: 'September · 2026-09-30' },
    { id: '8', label: 'October' }
  ]);
  assert.equal(cliCalls.length, 3);
  assert.ok(
    cliCalls.every(
      args =>
        args[0] === 'api' &&
        args.includes('--paginate') &&
        args.includes('--slurp') &&
        args[args.length - 1]?.includes('per_page=100')
    )
  );
});

test('GitHub queues a fresh reconciliation after an overlapping pre-create refresh', async () => {
  const events: string[] = [];
  let refreshCount = 0;
  let resolveFirstRefresh!: (value: { repos: number; items: number }) => void;
  const firstRefresh = new Promise<{ repos: number; items: number }>(resolve => {
    resolveFirstRefresh = resolve;
  });
  const cachedIssue = {
    repo: 'acme/repo',
    number: 42,
    kind: 'issue' as const,
    title: 'Created during an older refresh',
    state: 'OPEN',
    author: 'mateo',
    labels: [],
    assignees: [],
    url: 'https://github.com/acme/repo/issues/42',
    body: 'The next provider refresh must include this issue.',
    updatedAt: '2026-08-26T12:00:00.000Z'
  };
  const bb = {
    sdk: {
      plugins: {
        async callRpc(input: { method: string }) {
          if (input.method === 'refresh') {
            refreshCount += 1;
            events.push(`refresh:${refreshCount}`);
            return refreshCount === 1
              ? firstRefresh
              : { repos: 1, items: 1 };
          }
          if (input.method === 'status') {
            return {
              ghOk: true,
              ghError: null,
              repos: [{ repo: 'acme/repo', projectId: 'proj_taskboard' }],
              lastSyncedAt: null
            };
          }
          if (input.method === 'getIssue') {
            const { kind: _kind, ...issue } = cachedIssue;
            return { issue: { ...issue, comments: [] } };
          }
          if (input.method === 'listItems') {
            return { items: refreshCount >= 2 ? [cachedIssue] : [] };
          }
          throw new Error(`Unexpected GitHub RPC: ${input.method}`);
        }
      }
    }
  };
  const runGithubCli = async (args: string[]) => {
    if (!args.includes('POST')) {
      throw new Error(`Unexpected GitHub CLI call: ${args.join(' ')}`);
    }
    events.push('create');
    return JSON.stringify({
      number: 42,
      html_url: cachedIssue.url,
      assignees: [],
      labels: [],
      milestone: null
    });
  };
  const adapter = createGithubAdapter(
    bb as never,
    true,
    'proj_taskboard',
    runGithubCli
  );

  const preCreateRefresh = adapter.list({ refresh: true });
  assert.equal(refreshCount, 1);
  await adapter.create({
    ...fullCreateInput,
    destinationId: 'acme/repo'
  });

  const reconciliation = adapter.list({ refresh: true });
  await Promise.resolve();
  assert.equal(
    refreshCount,
    1,
    'the fresh reconciliation must wait for the older refresh to settle'
  );

  resolveFirstRefresh({ repos: 1, items: 0 });
  const [, reconciledItems] = await Promise.all([
    preCreateRefresh,
    reconciliation
  ]);

  assert.equal(refreshCount, 2);
  assert.ok(events.indexOf('refresh:2') > events.indexOf('create'));
  assert.deepEqual(reconciledItems.map(item => item.locator), [
    'acme/repo#42'
  ]);
});

test('GitHub queues a post-write refresh when issue confirmation is ambiguous', async () => {
  let refreshCount = 0;
  let resolveFirstRefresh!: (value: { repos: number; items: number }) => void;
  const firstRefresh = new Promise<{ repos: number; items: number }>(resolve => {
    resolveFirstRefresh = resolve;
  });
  const cachedIssue = {
    repo: 'acme/repo',
    number: 42,
    kind: 'issue' as const,
    title: 'Possibly committed issue',
    state: 'OPEN',
    author: 'mateo',
    labels: [],
    assignees: [],
    url: 'https://github.com/acme/repo/issues/42',
    body: 'The POST committed before its response was lost.',
    updatedAt: '2026-08-26T12:00:00.000Z'
  };
  const bb = {
    sdk: {
      plugins: {
        async callRpc(input: { method: string }) {
          if (input.method === 'refresh') {
            refreshCount += 1;
            return refreshCount === 1
              ? firstRefresh
              : { repos: 1, items: 1 };
          }
          if (input.method === 'status') {
            return {
              ghOk: true,
              ghError: null,
              repos: [{ repo: 'acme/repo', projectId: 'proj_taskboard' }],
              lastSyncedAt: null
            };
          }
          if (input.method === 'listItems') {
            return { items: refreshCount >= 2 ? [cachedIssue] : [] };
          }
          throw new Error(`Unexpected GitHub RPC: ${input.method}`);
        }
      }
    }
  };
  const adapter = createGithubAdapter(
    bb as never,
    true,
    'proj_taskboard',
    async args => {
      if (args.includes('POST')) return '{response lost after write';
      throw new Error(`Unexpected GitHub CLI call: ${args.join(' ')}`);
    }
  );

  const preCreateRefresh = adapter.list({ refresh: true });
  assert.equal(refreshCount, 1);
  await assert.rejects(
    adapter.create({ ...fullCreateInput, destinationId: 'acme/repo' }),
    /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u
  );

  const reconciliation = adapter.list({ refresh: true });
  await Promise.resolve();
  assert.equal(
    refreshCount,
    1,
    'ambiguous writes must wait for the older refresh before forcing a new one'
  );
  resolveFirstRefresh({ repos: 1, items: 0 });
  const [, reconciledItems] = await Promise.all([
    preCreateRefresh,
    reconciliation
  ]);

  assert.equal(refreshCount, 2);
  assert.deepEqual(reconciledItems.map(item => item.locator), [
    'acme/repo#42'
  ]);
});

test('GitHub forced reconciliation refreshes before listing only project-scoped repos', async () => {
  const rpcCalls: string[] = [];
  const bb = {
    sdk: {
      plugins: {
        async callRpc(input: {
          method: string;
          input: { repo?: string } | null;
        }) {
          if (input.method === 'refresh') {
            rpcCalls.push('refresh');
            return { repos: 2, items: 2 };
          }
          if (input.method === 'status') {
            rpcCalls.push('status');
            return {
              ghOk: true,
              ghError: null,
              repos: [
                { repo: 'acme/repo', projectId: 'proj_taskboard' },
                { repo: 'other/repo', projectId: 'proj_other' }
              ],
              lastSyncedAt: '2026-08-26T12:00:00.000Z'
            };
          }
          if (input.method === 'listItems') {
            rpcCalls.push(`listItems:${input.input?.repo}`);
            return {
              items: [
                {
                  repo: 'acme/repo',
                  number: 42,
                  kind: 'issue',
                  title: 'Freshly created issue',
                  state: 'OPEN',
                  author: 'mateo',
                  labels: [],
                  assignees: [],
                  url: 'https://github.com/acme/repo/issues/42',
                  body: 'Now present in the authoritative cache.',
                  updatedAt: '2026-08-26T12:00:00.000Z'
                }
              ]
            };
          }
          throw new Error(`Unexpected GitHub RPC: ${input.method}`);
        }
      }
    }
  };
  const adapter = createGithubAdapter(
    bb as never,
    true,
    'proj_taskboard',
    async () => {
      throw new Error('GitHub CLI is not used while reconciling');
    }
  );

  const items = await adapter.list({ refresh: true });

  assert.deepEqual(rpcCalls, [
    'refresh',
    'status',
    'listItems:acme/repo'
  ]);
  assert.deepEqual(items.map(item => item.locator), ['acme/repo#42']);
});
