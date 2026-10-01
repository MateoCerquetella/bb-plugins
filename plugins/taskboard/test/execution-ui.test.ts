import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const panel = await readFile(
  new URL('../execution/panel.tsx', import.meta.url),
  'utf8'
);
const app = await readFile(new URL('../app.tsx', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');

test('one-click start dispatches one new BB thread', () => {
  assert.match(
    app,
    /if \(pending\.current\.has\(itemId\)\) return[\s\S]*?pending\.current\.add\(itemId\)/u
  );
  assert.match(app, /rpc\.call\('startAgentThread'/u);
  assert.match(server, /agentThreadStarts\.get\(taskKey\)/u);
  assert.match(server, /bb\.sdk\.threads\.spawn\(/u);
});

test('one-click start initializes Git and attaches Taskboard to the thread', () => {
  assert.match(server, /resolveExecutionDefaults\(source\.path/u);
  assert.match(server, /initializeRepository: true/u);
  assert.match(server, /formatWorkItemHandoffPrompt\(item\)/u);
  assert.match(server, /bb\.sdk\.threads\.tabs\.update\(/u);
  assert.match(server, /paramsJson: JSON\.stringify/u);
});

test('one-click start falls back to the existing composer when disabled', () => {
  assert.match(
    app,
    /if \(!config\.enabled\)[\s\S]*?navigate\.toCompose\([\s\S]*?formatWorkItemHandoffPrompt\(item\)/u
  );
});

test('the embedded execution status does not expose a second Execute action', () => {
  assert.doesNotMatch(panel, />\s*Execute\s*</u);
});
