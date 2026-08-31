import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildIssueDraftPlanInput,
  buildIssueDraftPrompt,
  classifyIssueDraftPendingInteractions,
  fallbackIssueDraft,
  parseIssueDraftOutput,
  resolveIssueDraftPlanSelection,
  type IssueDraftProviderInfo
} from '../issue-draft.ts';

function provider(
  overrides: Partial<IssueDraftProviderInfo> = {}
): IssueDraftProviderInfo {
  return {
    id: 'claude-code',
    available: true,
    capabilities: {
      supportedPermissionModes: ['accept-edits', 'auto', 'full']
    },
    composerActions: [
      {
        kind: 'plan',
        command: { trigger: '/', name: 'plan', trailingText: ' ' }
      }
    ],
    ...overrides
  };
}

test('parses a tagged model response into a ticket draft', () => {
  const draft = parseIssueDraftOutput(`Some ignored preface
<TASKBOARD_ISSUE_DRAFT>
{"title":"Create issues from New thread prompts","description":"Context.\\n\\n## Requested change\\nDraft the ticket.\\n\\n## Acceptance criteria\\n- [ ] The title is editable."}
</TASKBOARD_ISSUE_DRAFT>`);

  assert.deepEqual(draft, {
    title: 'Create issues from New thread prompts',
    description:
      'Context.\n\n## Requested change\nDraft the ticket.\n\n## Acceptance criteria\n- [ ] The title is editable.'
  });
});

test('rejects malformed or incomplete model output', () => {
  assert.equal(parseIssueDraftOutput('I could not produce the ticket.'), null);
  assert.equal(
    parseIssueDraftOutput(
      '<TASKBOARD_ISSUE_DRAFT>{"title":"Only a title"}</TASKBOARD_ISSUE_DRAFT>'
    ),
    null
  );
  const validJson = JSON.stringify({
    title: 'Untagged draft',
    description: 'This valid JSON still lacks the required trust envelope.'
  });
  assert.equal(parseIssueDraftOutput(validJson), null);
  assert.equal(parseIssueDraftOutput(`\`\`\`json\n${validJson}\n\`\`\``), null);
});

test('builds a Plan-only repository-aware worker prompt', () => {
  const prompt = buildIssueDraftPrompt({
    prompt: 'make this work from new thread',
    projectName: 'bb-plugins',
    source: 'linear'
  });

  assert.match(prompt, /inspect the repository/u);
  assert.match(prompt, /Do not edit files/u);
  assert.match(prompt, /Do not implement the proposed Plan/u);
  assert.match(prompt, /proposed Plan body itself must be exactly/u);
  assert.match(prompt, /stop the helper without approving it/u);
  assert.match(prompt, /bb-plugins/u);
  assert.match(prompt, /linear/u);
  assert.match(prompt, /make this work from new thread/u);
});

test('selects only the project default provider with strict Plan capabilities', () => {
  const bb38 = { currentVersion: '0.38.0' };
  assert.deepEqual(
    resolveIssueDraftPlanSelection(
      { providerId: 'claude-code' },
      [provider({ id: 'codex' }), provider()],
      bb38
    ),
    {
      providerId: 'claude-code',
      command: { trigger: '/', name: 'plan', trailingText: ' ' }
    }
  );

  assert.throws(
    () => resolveIssueDraftPlanSelection(null, [provider()], bb38),
    /no default drafting provider/u
  );
  assert.throws(
    () =>
      resolveIssueDraftPlanSelection(
        { providerId: 'missing' },
        [provider({ id: 'fallback-that-must-not-be-used' })],
        bb38
      ),
    /default provider is unavailable/u
  );
  assert.throws(
    () =>
      resolveIssueDraftPlanSelection(
        { providerId: 'claude-code' },
        [
          provider({
            capabilities: { supportedPermissionModes: ['auto', 'full'] }
          })
        ],
        bb38
      ),
    /does not support accept-edits/u
  );
  assert.throws(
    () =>
      resolveIssueDraftPlanSelection(
        { providerId: 'claude-code' },
        [provider({ composerActions: [{ kind: 'skills' }] })],
        bb38
      ),
    /does not advertise one Plan action/u
  );
  assert.throws(
    () =>
      resolveIssueDraftPlanSelection(
        { providerId: 'claude-code' },
        [
          provider({
            composerActions: [
              {
                kind: 'plan',
                command: {
                  trigger: '/',
                  name: 'plan',
                  trailingText: 'inject this text'
                }
              }
            ]
          })
        ],
        bb38
      ),
    /invalid Plan action/u
  );
  assert.throws(
    () =>
      resolveIssueDraftPlanSelection(
        { providerId: 'codex' },
        [provider({ id: 'codex' })],
        bb38
      ),
    /cannot enforce Plan mode/u
  );
  assert.equal(
    resolveIssueDraftPlanSelection(
      { providerId: 'codex' },
      [provider({ id: 'codex' })],
      { currentVersion: '0.40.0' }
    ).providerId,
    'codex'
  );
});

test('builds exact structured initial Plan input', () => {
  const input = buildIssueDraftPlanInput(
    {
      providerId: 'claude-code',
      command: { trigger: '/', name: 'plan-now', trailingText: '\n' }
    },
    'Draft this ticket.'
  );

  assert.deepEqual(input, [
    {
      type: 'text',
      text: '/plan-now\nDraft this ticket.',
      mentions: [
        {
          start: 0,
          end: '/plan-now'.length,
          resource: {
            kind: 'command',
            trigger: '/',
            name: 'plan-now',
            source: 'command',
            origin: 'user',
            label: 'plan-now',
            argumentHint: null
          }
        }
      ]
    }
  ]);
});

test('classifies only one pending Plan from the expected provider', () => {
  const plan = {
    status: 'pending',
    providerId: 'claude-code',
    payload: {
      kind: 'approval',
      subject: { kind: 'plan', plan: '<TASKBOARD_ISSUE_DRAFT>{}</TASKBOARD_ISSUE_DRAFT>' }
    }
  };

  assert.deepEqual(
    classifyIssueDraftPendingInteractions([plan], 'claude-code'),
    {
      kind: 'plan',
      text: '<TASKBOARD_ISSUE_DRAFT>{}</TASKBOARD_ISSUE_DRAFT>'
    }
  );
  assert.deepEqual(
    classifyIssueDraftPendingInteractions([], 'claude-code'),
    { kind: 'none' }
  );
  assert.deepEqual(
    classifyIssueDraftPendingInteractions(
      [{ ...plan, status: 'resolved' }],
      'claude-code'
    ),
    { kind: 'none' }
  );
  assert.deepEqual(
    classifyIssueDraftPendingInteractions(
      [{ ...plan, status: 'resolving' }],
      'claude-code'
    ),
    { kind: 'unexpected' }
  );
  for (const interactions of [
    [{ ...plan, providerId: 'codex' }],
    [
      {
        status: 'pending',
        providerId: 'claude-code',
        payload: { kind: 'user_question' }
      }
    ],
    [plan, plan]
  ]) {
    assert.deepEqual(
      classifyIssueDraftPendingInteractions(interactions, 'claude-code'),
      { kind: 'unexpected' }
    );
  }
});

test('keeps the original prompt as an editable fallback', () => {
  assert.deepEqual(
    fallbackIssueDraft('# Fix the task title\n\nKeep the full context.'),
    {
      title: 'Fix the task title',
      description: '# Fix the task title\n\nKeep the full context.'
    }
  );
});
