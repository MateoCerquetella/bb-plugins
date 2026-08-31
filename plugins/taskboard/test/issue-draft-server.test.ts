import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';

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

const { default: taskboardPlugin } = await import('../server.ts');

const PROJECT_ID = 'proj_taskboard';
const REQUEST_ID = '00000000-0000-4000-8000-000000000129';
const HELPER_THREAD_ID = 'thread_issue_draft';

const planProvider = {
  id: 'claude-code',
  displayName: 'Claude Code',
  logoUrl: null,
  available: true,
  capabilities: {
    supportsArchive: false,
    supportsRename: false,
    supportsServiceTier: false,
    supportsUserQuestion: true,
    supportsFork: true,
    supportedPermissionModes: ['accept-edits', 'auto', 'full']
  },
  composerActions: [
    { kind: 'skills', trigger: '/' },
    {
      kind: 'plan',
      command: { trigger: '/', name: 'plan', trailingText: ' ' }
    }
  ]
};

const executionDefaults = {
  providerId: 'claude-code',
  model: 'claude-sonnet',
  serviceTier: 'default',
  reasoningLevel: 'medium',
  permissionMode: 'auto'
};

function taggedDraft(title = 'Plan-only draft'): string {
  return [
    '<TASKBOARD_ISSUE_DRAFT>',
    JSON.stringify({
      title,
      description:
        'Context.\n\n## Requested change\nUse Plan mode.\n\n## Acceptance criteria\n- [ ] Stop before persisting.'
    }),
    '</TASKBOARD_ISSUE_DRAFT>'
  ].join('\n');
}

function projectRows() {
  return [{ id: PROJECT_ID, name: 'Taskboard' }];
}

async function startDraftHarness(options: {
  interactions: unknown[];
  provider?: typeof planProvider;
  status?: 'active' | 'idle' | 'error';
  output?: string;
}) {
  const lifecycle: string[] = [];
  const host = createFakePluginHost({
    pluginId: 'taskboard',
    sdk: {
      subscribe: () => () => undefined,
      projects: {
        list: async () => projectRows(),
        defaultExecutionOptions: async () => executionDefaults
      },
      providers: {
        list: async () => [options.provider ?? planProvider]
      },
      system: {
        version: async () => ({ currentVersion: '0.38.0' })
      },
      threads: {
        spawn: async () => {
          lifecycle.push('spawn');
          return { id: HELPER_THREAD_ID };
        },
        interactions: {
          list: async () => {
            lifecycle.push('interactions.list');
            return options.interactions;
          }
        },
        get: async () => {
          lifecycle.push('get');
          return {
            id: HELPER_THREAD_ID,
            providerId: 'claude-code',
            status: options.status ?? 'active'
          };
        },
        output: async () => {
          lifecycle.push('output');
          return { output: options.output ?? taggedDraft('Idle draft') };
        },
        stop: async () => {
          lifecycle.push('stop');
          return { ok: true };
        },
        archive: async () => {
          lifecycle.push('archive');
          return { ok: true };
        }
      }
    }
  });
  await taskboardPlugin(host.bb);
  return { ...host, lifecycle };
}

async function startDraft(
  harness: ReturnType<typeof createFakePluginHost>['harness']
) {
  return harness.behavior.callRpc('startIssueDraft', {
    requestId: REQUEST_ID,
    projectId: PROJECT_ID,
    prompt: 'Draft the marketplace review fix.'
  });
}

test('spawns native Plan input and stops before persisting the proposed Plan', async () => {
  const { harness, lifecycle } = await startDraftHarness({
    interactions: [
      {
        status: 'pending',
        providerId: 'claude-code',
        payload: {
          kind: 'approval',
          subject: { kind: 'plan', plan: taggedDraft() }
        }
      }
    ]
  });

  try {
    await startDraft(harness);
    const { draft } = (await harness.behavior.callRpc('getIssueDraft', {
      requestId: REQUEST_ID
    })) as {
      draft: { status: string; title?: string } | null;
    };
    assert.deepEqual(draft && { status: draft.status, title: draft.title }, {
      status: 'complete',
      title: 'Plan-only draft'
    });

    const spawnCalls = harness.inspection.sdk.callsTo('threads.spawn');
    assert.equal(spawnCalls.length, 1);
    const spawn = spawnCalls[0]?.[0] as Record<string, unknown>;
    assert.equal('prompt' in spawn, false);
    assert.equal(spawn.providerId, 'claude-code');
    assert.equal(spawn.permissionMode, 'accept-edits');
    assert.equal(spawn.visibility, 'hidden');
    assert.deepEqual(spawn.environment, { type: 'project-default' });
    assert.deepEqual(spawn.executionInputSources, {
      providerId: 'explicit',
      permissionMode: 'explicit'
    });
    assert.deepEqual(
      (spawn.input as Array<{ text: string; mentions: unknown[] }>)[0]
        ?.mentions,
      [
        {
          start: 0,
          end: 5,
          resource: {
            kind: 'command',
            trigger: '/',
            name: 'plan',
            source: 'command',
            origin: 'user',
            label: 'plan',
            argumentHint: null
          }
        }
      ]
    );
    assert.match(
      (spawn.input as Array<{ text: string }>)[0]?.text ?? '',
      /^\/plan You are a Plan-only issue-drafting assistant/u
    );
    assert.deepEqual(lifecycle, [
      'spawn',
      'interactions.list',
      'get',
      'stop',
      'archive'
    ]);
    assert.equal(
      harness.inspection.sdk.callsTo('threads.interactions.resolve').length,
      0
    );
    assert.equal(
      harness.inspection.sdk.callsTo('threads.interactions.cancel').length,
      0
    );
  } finally {
    await harness.lifecycle.dispose();
  }
});

test('stops and fails closed on an unexpected pending interaction', async () => {
  const { harness, lifecycle } = await startDraftHarness({
    interactions: [
      {
        status: 'pending',
        providerId: 'claude-code',
        payload: { kind: 'user_question', questions: [] }
      }
    ]
  });

  try {
    await startDraft(harness);
    const { draft } = (await harness.behavior.callRpc('getIssueDraft', {
      requestId: REQUEST_ID
    })) as {
      draft: { status: string; error?: string } | null;
    };
    assert.equal(draft?.status, 'failed');
    assert.match(draft?.error ?? '', /unexpected interaction/u);
    assert.deepEqual(lifecycle, [
      'spawn',
      'interactions.list',
      'get',
      'stop',
      'archive'
    ]);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test('keeps a stopped draft retryable until archive succeeds', async () => {
  const interactions: unknown[] = [];
  const { harness, lifecycle } = await startDraftHarness({ interactions });

  try {
    await startDraft(harness);
    interactions.push({
      status: 'pending',
      providerId: 'claude-code',
      payload: {
        kind: 'approval',
        subject: { kind: 'plan', plan: taggedDraft('Retried archive') }
      }
    });
    harness.inspection.sdk.stub('threads.archive', async () => {
      lifecycle.push('archive-failed');
      throw new Error('temporary archive failure');
    });

    const first = (await harness.behavior.callRpc('getIssueDraft', {
      requestId: REQUEST_ID
    })) as { draft: { status: string } | null };
    assert.equal(first.draft?.status, 'running');

    harness.inspection.sdk.stub('threads.archive', async () => {
      lifecycle.push('archive-retried');
      return { ok: true };
    });
    const second = (await harness.behavior.callRpc('getIssueDraft', {
      requestId: REQUEST_ID
    })) as { draft: { status: string; title?: string } | null };
    assert.deepEqual(
      second.draft && {
        status: second.draft.status,
        title: second.draft.title
      },
      { status: 'complete', title: 'Retried archive' }
    );
    assert.ok(lifecycle.indexOf('stop') < lifecycle.indexOf('archive-failed'));
    assert.ok(lifecycle.includes('archive-retried'));
  } finally {
    await harness.lifecycle.dispose();
  }
});

test('preserves the idle output fallback while stopping before persistence', async () => {
  const { harness, lifecycle } = await startDraftHarness({
    interactions: [],
    status: 'idle',
    output: taggedDraft('Idle output draft')
  });

  try {
    await startDraft(harness);
    const { draft } = (await harness.behavior.callRpc('getIssueDraft', {
      requestId: REQUEST_ID
    })) as {
      draft: { status: string; title?: string } | null;
    };
    assert.equal(draft?.status, 'complete');
    assert.equal(draft?.title, 'Idle output draft');
    assert.deepEqual(lifecycle, [
      'spawn',
      'interactions.list',
      'get',
      'output',
      'stop',
      'archive'
    ]);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test('does not spawn when the project provider lacks native Plan support', async () => {
  const unsupported = {
    ...planProvider,
    composerActions: [{ kind: 'skills', trigger: '/' }]
  };
  const { harness } = await startDraftHarness({
    interactions: [],
    provider: unsupported
  });

  try {
    await assert.rejects(startDraft(harness), /does not advertise one Plan/u);
    assert.equal(harness.inspection.sdk.callsTo('threads.spawn').length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});
