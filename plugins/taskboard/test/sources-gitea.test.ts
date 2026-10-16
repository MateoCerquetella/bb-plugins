import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return nextResolve(specifier, context);
} });

const { createGiteaAdapter, parseGiteaRef, giteaStatusCategory } = await import('../sources/gitea.ts');
type TeaRunner = import('../sources/gitea.ts').TeaRunner;
const ref = 'git.example.com/team/app';
const locator = `${ref}#7`;
const bug = { id: 1, name: 'bug' };
const progress = { id: 2, name: 'status/in-progress' };
const done = { id: 3, name: 'status/done' };
const canceled = { id: 4, name: 'status/canceled' };
const critical = { id: 5, name: 'customer-critical' };
function issue(number = 7) { return {
  number, title: 'A useful task', body: 'External text', state: 'open',
  html_url: `https://git.example.com/team/app/issues/${number}`,
  labels: [bug, progress], assignees: [{ login: 'alice' }], updated_at: '2026-10-14T12:00:00Z'
}; }

function fixture(overrides: { host?: string; failPatch?: boolean; badCreate?: boolean;
  initialLabels?: typeof bug[]; concurrentLabelChange?: boolean; failDelete?: boolean } = {}) {
  const calls: { args: string[]; stdin?: string }[] = [];
  let current = issue();
  if (overrides.initialLabels) current.labels = overrides.initialLabels;
  const runner: TeaRunner = async (args, stdin) => {
    calls.push({ args, stdin });
    if (args[0] === 'logins') return JSON.stringify([{ name: 'pilot', url: `https://${overrides.host ?? 'git.example.com'}` }]);
    assert.equal(args[2], 'pilot');
    const path = args[5].split('?')[0];
    const method = args[4];
    const body = stdin ? JSON.parse(stdin) : undefined;
    if (new URLSearchParams(args[5].split('?')[1]).get('page') === '2') return '[]';
    if (path.endsWith('/comments')) return JSON.stringify([{ user: { login: 'bob' }, body: 'Live comment', created_at: '2026-10-14T12:01:00Z' }]);
    if (path.endsWith('/labels') && method === 'GET') {
      if (overrides.concurrentLabelChange) current.labels = [...current.labels.filter(label => label.id !== bug.id), critical];
      return JSON.stringify([bug, progress, done, canceled]);
    }
    if (path.endsWith('/labels') && method === 'PUT') {
      current.labels = [bug, progress, done].filter(label => body.labels.includes(label.id));
      return JSON.stringify(current.labels);
    }
    if (method === 'DELETE') {
      if (overrides.failDelete) throw new Error('connection lost');
      current.labels = current.labels.filter(label => label.id !== Number(path.split('/').at(-1)));
      return ''; // Gitea responds with 204 No Content.
    }
    if (path.endsWith('/labels') && method === 'POST') {
      current.labels = [...new Map([...current.labels, ...[bug, progress, done, canceled].filter(label => body.labels.includes(label.id))]
        .map(label => [label.id, label])).values()];
      return JSON.stringify(current.labels);
    }
    if (path.endsWith('/assignees')) return JSON.stringify([{ login: 'alice' }]);
    if (path.endsWith('/milestones')) return JSON.stringify([{ id: 4, title: 'Pilot' }]);
    if (method === 'PATCH') {
      if (overrides.failPatch) throw new Error('connection lost');
      current.state = body.state;
      return JSON.stringify(current);
    }
    if (method === 'POST') {
      if (overrides.badCreate) return '{';
      current = { ...current, title: body.title, body: body.body, labels: [bug] };
      return JSON.stringify(current);
    }
    return JSON.stringify(current);
  };
  return { calls, runner, adapter: createGiteaAdapter({ enabled: true, login: 'pilot', projectRef: ref, runner }) };
}

test('rejects malformed repositories and parses custom host ports', () => {
  assert.deepEqual(parseGiteaRef('git.example.com:3000/team/app'), { host: 'git.example.com:3000', owner: 'team', repo: 'app' });
  for (const invalid of ['', 'team/app', 'https://git.example.com/team/app', 'user@host/team/app', 'host/team/..', 'host/team/app?token=x', 'host/team/app#1', 'host/team/app/extra']) {
    assert.throws(() => parseGiteaRef(invalid), invalid);
  }
});

test('foreign issue locators are rejected before even invoking tea', async () => {
  const { adapter, calls } = fixture();
  await assert.rejects(adapter.updateStatus('git.example.com/other/app#7', '3'), /outside/u);
  await assert.rejects(adapter.get(`${ref}#0`), /outside/u);
  assert.equal(calls.length, 0);
});

test('login host mismatch cannot make an authenticated API request', async () => {
  const { adapter, calls } = fixture({ host: 'foreign.example.com' });
  await assert.rejects(adapter.get(locator), /does not match/u);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], 'logins');
});

test('supports reverse-proxy base paths without accepting an unrelated issue URL', async () => {
  const runner: TeaRunner = async args => args[0] === 'logins'
    ? JSON.stringify([{ name: 'pilot', url: 'https://git.example.com/gitea/' }])
    : JSON.stringify(issue());
  await assert.rejects(createGiteaAdapter({ enabled: true, login: 'pilot', projectRef: ref, runner }).get(locator), /outside/u);
});

test('reads all issue pages, filters pull requests and keeps comments live', async () => {
  const calls: string[][] = [];
  const runner: TeaRunner = async args => {
    calls.push(args);
    if (args[0] === 'logins') return JSON.stringify([{ name: 'pilot', url: 'https://git.example.com' }]);
    if (args[5].includes('/comments')) return '[]';
    if (!args[5].includes('?')) return JSON.stringify(issue());
    const page = Number(new URLSearchParams(args[5].split('?')[1]).get('page'));
    if (page > 2) return '[]';
    if (page === 2) return JSON.stringify([issue(51)]);
    return JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ ...issue(i + 1), ...(i === 1 ? { pull_request: {} } : {}) })));
  };
  const adapter = createGiteaAdapter({ enabled: true, login: 'pilot', projectRef: ref, runner });
  const list = await adapter.list();
  assert.equal(list.length, 50);
  assert.equal(list.at(-1)?.locator, `${ref}#51`);
  assert.ok(list.every(item => !('comments' in item)));
  assert.ok(calls.filter(args => args[0] === 'api').every(args => args[2] === 'pilot'));
  const live = await adapter.get(locator);
  assert.deepEqual(live.comments, []);
});

test('detail includes live comments and native assignee names', async () => {
  const { adapter } = fixture();
  const result = await adapter.get(locator);
  assert.equal(result.status, 'in-progress');
  assert.equal(result.assignee, 'alice');
  assert.equal(result.comments[0].author, 'bob');
});

test('server-capped pages include every issue, comment and creation metadata option', async () => {
  const paths: string[] = [];
  const runner: TeaRunner = async args => {
    if (args[0] === 'logins') return JSON.stringify([{ name: 'pilot', url: 'https://git.example.com' }]);
    const [path, query] = args[5].split('?');
    const page = Number(new URLSearchParams(query).get('page'));
    if (!page) return JSON.stringify(issue());
    paths.push(args[5]);
    const records = Array.from({ length: 21 }, (_, index) => {
      const id = index + 1;
      if (path.endsWith('/comments')) return { user: { login: `user${id}` }, body: `Comment ${id}`, created_at: '2026-10-14T12:00:00Z' };
      if (path.endsWith('/labels')) return { id, name: `label${id}` };
      if (path.endsWith('/assignees')) return { login: `user${id}` };
      if (path.endsWith('/milestones')) return { id, title: `Milestone ${id}` };
      return issue(id);
    });
    return JSON.stringify(records.slice((page - 1) * 20, page * 20));
  };
  const adapter = createGiteaAdapter({ enabled: true, login: 'pilot', projectRef: ref, runner });
  assert.equal((await adapter.list()).at(-1)?.locator, `${ref}#21`);
  assert.equal((await adapter.get(locator)).comments.at(-1)?.body, 'Comment 21');
  const metadata = await adapter.createMetadata({ destinationId: ref, issueType: null });
  assert.equal(metadata.labelOptions.at(-1)?.id, '21');
  assert.equal(metadata.assigneeOptions.at(-1)?.id, 'user21');
  assert.equal(metadata.milestoneOptions.at(-1)?.id, '21');
  assert.equal(paths.length, 15);
});

test('pagination fails explicitly rather than truncating a server that never exhausts', async () => {
  let requests = 0;
  const runner: TeaRunner = async args => {
    if (args[0] === 'logins') return JSON.stringify([{ name: 'pilot', url: 'https://git.example.com' }]);
    requests++;
    return JSON.stringify([issue()]);
  };
  await assert.rejects(createGiteaAdapter({ enabled: true, login: 'pilot', projectRef: ref, runner }).list(), /page limit/u);
  assert.equal(requests, 200);
});

test('terminal and resumed workflow moves preserve unrelated labels', async () => {
  const { adapter, calls } = fixture();
  const finished = await adapter.updateStatus(locator, '3');
  assert.equal(finished.stateCategory, 'done');
  assert.deepEqual(finished.labels, ['bug', 'status/done']);
  const resumed = await adapter.updateStatus(locator, '2');
  assert.equal(resumed.stateCategory, 'in_progress');
  assert.deepEqual(resumed.labels, ['bug', 'status/in-progress']);
  assert.deepEqual(calls.filter(call => call.args[4] === 'PATCH').map(call => JSON.parse(call.stdin!).state), ['closed', 'open']);
});

test('native Open clears workflow labels and retains ordinary labels', async () => {
  const { adapter } = fixture();
  const result = await adapter.updateStatus(locator, '__open__');
  assert.equal(result.status, 'Open');
  assert.deepEqual(result.labels, ['bug']);
  assert.equal((await adapter.statusOptions(locator)).filter(status => status.current).length, 1);
});

test('workflow moves preserve concurrent ordinary label additions and removals', async () => {
  const { adapter, calls } = fixture({ concurrentLabelChange: true });
  const result = await adapter.updateStatus(locator, '3');
  assert.deepEqual(result.labels, ['customer-critical', 'status/done']);
  assert.equal(calls.filter(call => call.args[4] === 'PUT').length, 0);
  assert.deepEqual(calls.filter(call => call.args[4] === 'DELETE').map(call => call.args[5]), ['repos/team/app/issues/7/labels/2']);
});

for (const terminal of [done, canceled]) {
  test(`reopened issue with ${terminal.name} is open until explicitly closed again`, async () => {
    const { adapter } = fixture({ initialLabels: [bug, terminal] });
    const reopened = await adapter.get(locator);
    assert.equal(reopened.stateCategory, 'todo');
    assert.equal(reopened.status, 'Open');
    assert.deepEqual((await adapter.statusOptions(locator)).filter(status => status.current).map(status => status.id), ['__open__']);
    const closed = await adapter.updateStatus(locator, String(terminal.id));
    assert.equal(closed.stateCategory, giteaStatusCategory(terminal.name));
    assert.equal(closed.status, terminal.name.slice('status/'.length));
  });
}

test('failed label removal stops further writes and reports a partial outcome', async () => {
  const { adapter, calls } = fixture({ failDelete: true });
  await assert.rejects(adapter.updateStatus(locator, '3'), /may be partial/u);
  assert.deepEqual(calls.filter(call => call.args[0] === 'api' && call.args[4] !== 'GET').map(call => call.args[4]), ['DELETE']);
});

test('partial state write is reported without retries', async () => {
  const { adapter, calls } = fixture({ failPatch: true });
  await assert.rejects(adapter.updateStatus(locator, '3'), /may be partial/u);
  assert.equal(calls.filter(call => call.args[4] === 'DELETE').length, 1);
  assert.equal(calls.filter(call => call.args[4] === 'POST').length, 1);
  assert.equal(calls.filter(call => call.args[4] === 'PATCH').length, 1);
  assert.equal((await adapter.get(locator)).stateCategory, 'todo');
});

test('unknown status is rejected without any write', async () => {
  const { adapter, calls } = fixture();
  await assert.rejects(adapter.updateStatus(locator, '99'), /current Gitea workflow/u);
  assert.ok(calls.every(call => call.args[0] !== 'api' || call.args[4] === 'GET'));
});

const input = { title: 'Fix & test $(not a command)', description: 'Body with commas, quotes and &', destinationId: ref,
  issueType: null, statusId: '__open__', assigneeId: 'alice', priorityId: null, labelIds: ['1'], dueDate: '2026-10-21', milestoneId: '4' };

test('creation uses stdin JSON and confirms the requested assignee', async () => {
  const { adapter, calls } = fixture();
  const result = await adapter.create(input);
  assert.equal(result.item.title, input.title);
  assert.deepEqual(result.assigneeConfirmation, { confirmed: true, id: 'alice' });
  const write = calls.find(call => call.args[4] === 'POST')!;
  assert.ok(write.args.includes('@-'));
  assert.ok(!write.args.includes(input.title));
  const sent = JSON.parse(write.stdin!);
  assert.deepEqual(sent.labels, [1]);
  assert.equal(sent.milestone, 4);
  assert.equal(sent.due_date, '2026-10-21T23:59:59Z');
});

test('ambiguous creation is not retried and uses the shared uncertainty marker', async () => {
  const { adapter, calls } = fixture({ badCreate: true });
  await assert.rejects(adapter.create(input), /TASKBOARD_CREATE_OUTCOME_UNCERTAIN/u);
  assert.equal(calls.filter(call => call.args[4] === 'POST').length, 1);
});

test('metadata and creation reject foreign destinations before invoking tea', async () => {
  const { adapter, calls } = fixture();
  await assert.rejects(adapter.createMetadata({ destinationId: 'foreign/repo', issueType: null }), /outside/u);
  await assert.rejects(adapter.create({ ...input, destinationId: 'foreign/repo' }), /outside/u);
  assert.equal(calls.length, 0);
});

test('workflow taxonomy covers review and terminal stages', () => {
  assert.equal(giteaStatusCategory('status/review'), 'in_progress');
  assert.equal(giteaStatusCategory('STATUS/Done'), 'done');
  assert.equal(giteaStatusCategory('status/cancelled'), 'canceled');
  assert.equal(giteaStatusCategory('status/to_do'), 'todo');
});
