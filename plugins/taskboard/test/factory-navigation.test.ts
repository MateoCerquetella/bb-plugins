import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { originalTicketPath, ticketThreadId } from '../factory/navigation.ts';
import { consoleState, selectedRun, type RunSelection } from '../factory/console-state.ts';
import { approvePlan, newRecord, savePlan, startRun } from '../factory/state.ts';
import type { WorkItem } from '../contract.ts';

test('ticket entry opens the coordinator while stage sessions retain their identity', () => {
  const record: Parameters<typeof ticketThreadId>[0] = { coordinator: null, runs: [{ threadId: 'thr_stage' }] };
  assert.equal(ticketThreadId(record), 'thr_stage');
  record.coordinator = { status: 'ready', intentId: 'intent', startedAt: new Date().toISOString(),
    legacyRunCount: 0, threadId: 'thr_coordinator', nativeStatus: 'idle', error: null };
  assert.equal(ticketThreadId(record), 'thr_coordinator');
  record.coordinator = { status: 'uncertain', intentId: 'intent', startedAt: new Date().toISOString(),
    legacyRunCount: 0, error: 'Response lost' };
  assert.equal(ticketThreadId(record), null);
});

test('original provider ticket route round-trips reserved locator characters', () => {
  for (const locator of ['abc-123', 'owner/repo#42', 'literal~2F/% +?']) {
    const path = originalTicketPath({ projectId: 'proj_test', source: 'linear', locator });
    assert.equal(path.split('/').length, 4);
    assert.equal(decodeURIComponent(path.split('/')[3]!.replaceAll('~', '%')), locator);
  }
});

test('console follows current work until the operator selects an explicit attempt', () => {
  const item: WorkItem = {
    bbProjectId: 'proj_test', source: 'linear', locator: 'issue-42', key: 'BAN-42',
    title: 'Keep the console selection stable', description: '', url: '', status: 'Todo',
    stateCategory: 'todo', priority: null, assignee: null, project: null, labels: [], updatedAt: ''
  };
  const record = newRecord(item);
  startRun(record, 'investigate', false);
  const investigation = record.runs[0]!;
  investigation.status = 'finished';
  investigation.output = 'Investigation complete.';
  const follow: RunSelection = { kind: 'follow-current' };
  assert.equal(selectedRun(record, follow)?.id, investigation.id);
  assert.equal(consoleState(record).action, 'generate-plan');

  startRun(record, 'plan', false);
  const plan = record.runs.at(-1)!;
  assert.equal(selectedRun(record, follow)?.id, plan.id);
  const explicit: RunSelection = { kind: 'attempt', stage: 'investigate', runId: investigation.id };
  assert.equal(selectedRun(record, explicit)?.id, investigation.id);
  record.version++;
  assert.equal(selectedRun(record, explicit)?.id, investigation.id);
});

test('stale Build blockers require current plan approval then a new Build', () => {
  const item: WorkItem = {
    bbProjectId: 'proj_test', source: 'linear', locator: 'issue-42', key: 'BAN-42',
    title: 'Recover blocked work', description: '', url: '', status: 'Todo',
    stateCategory: 'todo', priority: null, assignee: null, project: null, labels: [], updatedAt: ''
  };
  const record = newRecord(item);
  savePlan(record, 'Original plan');
  approvePlan(record, record.plans[0]!.digest);
  const build = startRun(record, 'build', false);
  build.status = 'finished';
  build.threadId = 'thr_build';
  build.buildResult = { verdict: 'blocked', summary: 'More work needed', revision: null };
  record.automatic = true;
  record.automationError = 'Build blockers are stale. Approve the current plan before continuing.';
  assert.equal(consoleState(record).action, 'continue-build');

  savePlan(record, 'Revised plan');
  assert.equal(consoleState(record).action, 'approve-plan');
  approvePlan(record, record.plans.at(-1)!.digest);
  assert.equal(consoleState(record).action, 'start-build');

  build.kind = 'review';
  build.reviewResult = { verdict: 'blocked', findings: 'Old plan findings' };
  assert.equal(consoleState(record).action, 'start-build');

  record.scopeDigest = 'updated-ticket-scope';
  record.approvedDigest = null;
  assert.equal(consoleState(record).action, 'continue-task');
  build.status = 'running';
  assert.equal(consoleState(record).action, null);
  build.status = 'uncertain';
  assert.equal(consoleState(record).action, 'recover');
});

test('an archived completed Plan offers continuation without starting a new task', () => {
  const record = newRecord({
    bbProjectId: 'proj_test', source: 'linear', locator: 'issue-42', key: 'BAN-42',
    title: 'Continue planned work', description: '', url: '', status: 'In progress',
    stateCategory: 'in_progress', priority: null, assignee: null, project: null, labels: [], updatedAt: ''
  });
  const investigation = startRun(record, 'investigate', false);
  investigation.status = 'finished';
  investigation.output = 'Investigation complete.';
  const plan = startRun(record, 'plan', false);
  plan.status = 'finished';
  plan.threadId = 'thr_plan';
  savePlan(record, 'Implement the approved scope');
  approvePlan(record, record.plans[0]!.digest);
  record.automatic = true;
  record.automationError = 'Automatic work paused: The original authoring session is archived.';
  assert.equal(consoleState(record).action, 'continue-task');
  plan.status = 'running';
  assert.equal(consoleState(record).action, null);
  plan.status = 'uncertain';
  assert.equal(consoleState(record).action, 'recover');
});

test('work navigation never changes the persistent pin preference', async () => {
  const source = await readFile(new URL('../factory/app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /storeRightPanelPinned|pin\(\)|localStorage/);
  assert.match(source, /ticketThreadId\(record\)/);
  assert.match(source, /requestTaskboardOpen\(threadId\)/);
  const app = await readFile(new URL('../app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /storeRightPanelPinned\(true\)/);
  assert.match(app, /storeRightPanelPinned\(!pinned\)/);
});

test('commands stay in closed disclosures by default', async () => {
  const source = await readFile(new URL('../factory/room.tsx', import.meta.url), 'utf8');
  assert.match(source, /<details className="tb-room-details tb-room-commands">\s*<summary>[\s\S]*?Commands executed/);
  assert.match(source, /run\.checks\.map/);
  assert.match(source, /tb-room-command/);
  assert.match(source, /checks\.passed/);
  assert.match(source, /checks\.failed/);
  assert.match(source, /checks\.unknown/);
});

test('the room uses native diffs and keeps the validation evidence in the review card', async () => {
  const source = await readFile(new URL('../factory/room.tsx', import.meta.url), 'utf8');
  assert.match(source, /experimental_Diff as Diff/);
  assert.match(source, /rpc\.call\('factoryDiff'/);
  assert.match(source, /Current workspace diff/);
  assert.match(source, /view="unified"/);
  assert.match(source, /Validation evidence/);
  assert.doesNotMatch(source, /className="tb-room-details" open/);
});


test('the room shows a full progress with every stage clickable', async () => {
  const source = await readFile(new URL('../factory/room.tsx', import.meta.url), 'utf8');
  assert.match(source, /className="tb-room-progress"/u);
  assert.match(source, /className="tb-room-progress-steps"/u);
  assert.match(source, /stageKinds\.map/u);
  assert.match(source, /className="tb-room-step"/u);
  assert.match(source, /data-state=\{state\}/u);
  assert.doesNotMatch(source, /tb-room-agents/u);
});
