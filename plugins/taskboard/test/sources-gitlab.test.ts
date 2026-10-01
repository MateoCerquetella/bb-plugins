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

const {
  parseGitlabRef,
  issueLocator,
  parseIssueLocator,
  statusLabelCategory,
  statusLabels,
  issueStateCategory,
  issueStatusName,
  parseTokenOutput
} = await import('../sources/gitlab.ts');
const { withoutComments } = await import('../sources/types.ts');
const { workSourceSchema } = await import('../contract.ts');

test('gitlab is a registered taskboard source', () => {
  assert.ok(
    workSourceSchema.safeParse('gitlab').success
  );
});

test('refs must be host-qualified paths', () => {
  assert.deepEqual(parseGitlabRef('gitlab.com/group/app'), {
    host: 'gitlab.com',
    path: 'group/app'
  });
  assert.deepEqual(
    parseGitlabRef('gitlab.example.dev/group/subgroup/app'),
    {
      host: 'gitlab.example.dev',
      path: 'group/subgroup/app'
    }
  );
  assert.throws(() => parseGitlabRef('group/app'));
  assert.throws(() => parseGitlabRef('gitlab.com/app'));
  assert.throws(() => parseGitlabRef(''));
});

test('locators round-trip with ref and iid', () => {
  const locator = issueLocator('gitlab.com/group/app', 12);
  assert.equal(locator, 'gitlab.com/group/app#12');
  assert.deepEqual(parseIssueLocator(locator), {
    ref: 'gitlab.com/group/app',
    host: 'gitlab.com',
    path: 'group/app',
    iid: 12
  });
  assert.throws(() => parseIssueLocator('group/app#12'));
  assert.throws(() => parseIssueLocator('gitlab.com/group/app#0'));
  assert.throws(() => parseIssueLocator('gitlab.com/group/app#x'));
});

test('status label categories cover the five states', () => {
  assert.equal(statusLabelCategory('status/backlog'), 'backlog');
  assert.equal(statusLabelCategory('status/todo'), 'todo');
  assert.equal(statusLabelCategory('status/to do'), 'todo');
  assert.equal(statusLabelCategory('status/in_progress'), 'in_progress');
  assert.equal(statusLabelCategory('status/review'), 'in_progress');
  assert.equal(statusLabelCategory('status/done'), 'done');
  assert.equal(statusLabelCategory('status/canceled'), 'canceled');
  assert.equal(statusLabelCategory('status/cancelled'), 'canceled');
  assert.equal(statusLabelCategory('STATUS/Done'), 'done');
});

test('status labels filter out unrelated labels', () => {
  assert.deepEqual(
    statusLabels(['bug', 'status/in_progress', 'priority/high']),
    ['status/in_progress']
  );
});

test('state category prefers workflow labels over native state', () => {
  assert.equal(
    issueStateCategory(['status/backlog'], 'opened'),
    'backlog'
  );
  assert.equal(issueStateCategory(['bug'], 'opened'), 'todo');
  assert.equal(issueStateCategory([], 'opened'), 'todo');
  assert.equal(
    issueStateCategory(['bug'], 'closed'),
    'done'
  );
  assert.equal(
    issueStateCategory(['status/canceled'], 'opened'),
    'canceled'
  );
});

test('status name shows the workflow column name or the native state', () => {
  // The prefix is stripped so board facets and the move dropdown agree.
  assert.equal(issueStatusName(['status/review'], 'opened'), 'review');
  assert.equal(issueStatusName([], 'opened'), 'Open');
  assert.equal(issueStatusName(['bug'], 'closed'), 'Closed');
});

test('cached summaries never retain provider comments', () => {
  const detail = {
    source: 'gitlab' as const,
    locator: 'gitlab.com/group/app#7',
    key: 'gitlab.com/group/app#7',
    title: 'T',
    description: 'D',
    url: 'https://gitlab.com/group/app/-/issues/7',
    status: 'status/review',
    stateCategory: 'in_progress' as const,
    priority: null,
    assignee: null,
    project: 'gitlab.com/group/app',
    labels: ['status/review'],
    updatedAt: '2026-10-01T00:00:00.000Z',
    comments: [{ author: 'a', body: 'b', createdAt: 'c' }]
  };
  const summary = withoutComments(detail);
  assert.equal('comments' in summary, false);
  assert.equal(summary.key, 'gitlab.com/group/app#7');
});
test('untriaged issues keep native open/closed choices current-flagged', () => {
  // category from native state when no workflow label present
  assert.equal(issueStateCategory(['bug'], 'closed'), 'done');
  // label wins over native state
  assert.equal(issueStateCategory(['bug', 'status/done'], 'opened'), 'done');
});

test('stripped status names keep facet and dropdown consistent', () => {
  assert.equal(issueStatusName(['status/backlog'], 'opened'), 'backlog');
});
test('token line is parsed from glab stderr output', () => {
  const stderr = [
    'gitlab.com',
    '  \u2713 Logged in to gitlab.com as user',
    '  \u2713 REST API Endpoint: https://gitlab.com/api/v4/',
    '  \u2713 Token found in operating system keyring: glpat-abcd',
    '  ! secure it later'
  ].join('\n');
  assert.equal(parseTokenOutput(stderr), 'glpat-abcd');
  const plaintext = [
    '  \u2713 Token found in configuration file (plaintext): 5c4a5f'
  ].join('\n');
  assert.equal(parseTokenOutput(plaintext), '5c4a5f');
  assert.equal(parseTokenOutput(' nothing here '), null);
});
