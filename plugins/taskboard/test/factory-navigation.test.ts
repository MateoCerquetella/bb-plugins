import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { originalTicketPath } from '../factory/navigation.ts';

test('original provider ticket route round-trips reserved locator characters', () => {
  for (const locator of ['abc-123', 'owner/repo#42', 'literal~2F/% +?']) {
    const path = originalTicketPath({ projectId: 'proj_test', source: 'linear', locator });
    assert.equal(path.split('/').length, 4);
    assert.equal(decodeURIComponent(path.split('/')[3]!.replaceAll('~', '%')), locator);
  }
});

test('work navigation never changes the persistent pin preference', async () => {
  const source = await readFile(new URL('../factory/app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /storeRightPanelPinned|pin\(\)|localStorage/);
  assert.match(source, /requestTaskboardOpen\(run\.threadId\)/);
  const app = await readFile(new URL('../app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /storeRightPanelPinned\(true\)/);
  assert.match(app, /storeRightPanelPinned\(!pinned\)/);
});

test('command history and earlier runs use closed disclosures by default', async () => {
  const source = await readFile(new URL('../factory/app.tsx', import.meta.url), 'utf8');
  assert.match(source, /<details className="tb-run-disclosure tb-command-group">/);
  assert.match(source, /<details key=\{check\.id\} className="tb-command">/);
  assert.match(source, /\{passed\} passed/);
  assert.match(source, /\{failed\} failed/);
  assert.match(source, /\{unknown\} unknown/);
  assert.match(source, /Earlier runs/);
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
