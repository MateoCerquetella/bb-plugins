import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');

test('background sync can release promptly when BB reloads the plugin', () => {
  assert.match(server, /function waitUntilAborted/u);
  assert.match(server, /signal\.addEventListener\('abort', aborted/u);
  assert.match(
    server,
    /await waitUntilAborted\([\s\S]*?Promise\.all\([\s\S]*?syncAll/u
  );
  assert.match(server, /if \(signal\.aborted\) return/u);
});

test('native thread reconciliation stops promptly and consumes structured outcomes', () => {
  assert.match(server, /service\('agent-thread-reconciliation'/u);
  assert.match(server, /types: \['turn\/completed'\]/u);
  assert.match(server, /await sleep\(2000, signal\)/u);
  assert.match(server, /if \(signal\.aborted\) return/u);
});
