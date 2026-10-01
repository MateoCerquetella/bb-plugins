import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) {
        return { shortCircuit: true, url: url.href };
      }
    }
    return next(specifier, context);
  }
});

const { selectAgentStatus } = await import(
  '../execution/provider-status.ts'
);

const option = (
  id: string,
  name: string,
  stateCategory: 'in_progress' | 'done',
  current = false
) => ({ id, name, stateCategory, current });

test('managed start preserves an already-started provider state', () => {
  const selected = selectAgentStatus(
    [
      option('blocked', 'Blocked', 'in_progress'),
      option('review', 'In Review', 'in_progress', true),
      option('progress', 'In Progress', 'in_progress')
    ],
    'in_progress'
  );
  assert.equal(selected?.id, 'review');
});

test('managed start prefers canonical In Progress over Blocked', () => {
  const selected = selectAgentStatus(
    [
      option('blocked', 'Blocked', 'in_progress'),
      option('progress', 'In Progress', 'in_progress')
    ],
    'in_progress'
  );
  assert.equal(selected?.id, 'progress');
});

test('successful completion prefers canonical Done', () => {
  const selected = selectAgentStatus(
    [
      option('other', 'Released', 'done'),
      option('done', 'Done', 'done')
    ],
    'done'
  );
  assert.equal(selected?.id, 'done');
});
