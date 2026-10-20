import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { originalTicketPath, ticketThreadId } from '../factory/navigation.ts';
import { consoleState, selectedRun, type RunSelection } from '../factory/console-state.ts';
import { newRecord, startRun } from '../factory/state.ts';
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

test('work navigation never changes the persistent pin preference', async () => {
  const source = await readFile(new URL('../factory/app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /storeRightPanelPinned|pin\(\)|localStorage/);
  assert.match(source, /ticketThreadId\(record\)/);
  assert.match(source, /requestTaskboardOpen\(threadId\)/);
  const app = await readFile(new URL('../app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /storeRightPanelPinned\(true\)/);
  assert.match(app, /storeRightPanelPinned\(!pinned\)/);
});

test('command history uses closed disclosures by default', async () => {
  const source = await readFile(new URL('../factory/app.tsx', import.meta.url), 'utf8');
  assert.match(source, /<details className="tb-run-disclosure tb-command-group">/);
  assert.match(source, /<details key=\{check\.id\} className="tb-command">/);
  assert.match(source, /\{passed\} passed/);
  assert.match(source, /\{failed\} failed/);
  assert.match(source, /\{unknown\} unknown/);
});

test('progress uses native diffs and live-only reduced-motion-safe animation', async () => {
  const source = await readFile(new URL('../factory/app.tsx', import.meta.url), 'utf8');
  assert.match(source, /experimental_Diff as Diff/);
  assert.match(source, /rpc\.call\('factoryDiff'/);
  assert.match(source, /Current workspace diff/);
  assert.match(source, /view="unified"/);
  assert.doesNotMatch(source, /tb-latest-command/);
  assert.doesNotMatch(source, /className="tb-run-disclosure" open/);
  const css = await readFile(new URL('../app.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /\.tb-run\[data-live='true'\] \.tb-live-mark/);
});
