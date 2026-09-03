import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TASKBOARD_COMPOSER_MIME,
  hasTaskboardComposerDragType,
  parseTaskboardComposerMention,
  serializeTaskboardComposerMention,
  taskboardComposerMention,
  writeTaskboardComposerDrag
} from '../composer-handoff.ts';

const item = {
  bbProjectId: 'proj_123',
  source: 'github' as const,
  locator: 'octo/repo#42',
  key: 'GH-42'
};

test('builds and round-trips the bounded live Taskboard mention', () => {
  const mention = taskboardComposerMention(item);
  assert.deepEqual(mention, {
    provider: 'external-work-item',
    id: 'proj_123:github:octo/repo#42',
    label: 'GH-42'
  });
  const payload = serializeTaskboardComposerMention(mention);
  assert.ok(payload);
  assert.deepEqual(parseTaskboardComposerMention(payload), mention);
  assert.doesNotMatch(payload, /title|description|comment|url/i);
});

test('writes only the private mention payload with the requested drag effect', () => {
  const writes: Array<[string, string]> = [];
  const dataTransfer = {
    effectAllowed: 'none' as DataTransfer['effectAllowed'],
    setData(type: string, value: string) {
      writes.push([type, value]);
    }
  };
  assert.equal(writeTaskboardComposerDrag(dataTransfer, item, 'copyMove'), true);
  assert.equal(dataTransfer.effectAllowed, 'copyMove');
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.[0], TASKBOARD_COMPOSER_MIME);
  assert.deepEqual(parseTaskboardComposerMention(writes[0]?.[1] ?? ''),
    taskboardComposerMention(item));
  assert.equal(hasTaskboardComposerDragType([TASKBOARD_COMPOSER_MIME]), true);
  assert.equal(hasTaskboardComposerDragType(['text/plain']), false);
});

test('rejects malformed, oversized, unsafe, and expanded drag payloads', () => {
  const invalid = [
    '',
    '{',
    'x'.repeat(2_049),
    JSON.stringify(null),
    JSON.stringify({ provider: 'other', id: 'proj_1:github:1', label: 'GH-1' }),
    JSON.stringify({ provider: 'external-work-item', id: 'bad', label: 'GH-1' }),
    JSON.stringify({ provider: 'external-work-item', id: 'proj_1:github:1', label: '' }),
    JSON.stringify({ provider: 'external-work-item', id: 'proj_1:github:1', label: 'bad\u202e' }),
    JSON.stringify({
      provider: 'external-work-item',
      id: 'proj_1:github:1',
      label: 'GH-1',
      title: 'must not travel'
    })
  ];
  for (const payload of invalid) {
    assert.equal(parseTaskboardComposerMention(payload), null, payload);
  }
});

test('fails closed when an item cannot form a safe mention or DataTransfer rejects it', () => {
  const writes: string[] = [];
  const invalidTransfer = {
    effectAllowed: 'none' as DataTransfer['effectAllowed'],
    setData(_type: string, value: string) {
      writes.push(value);
    }
  };
  assert.equal(
    writeTaskboardComposerDrag(
      invalidTransfer,
      { ...item, key: 'bad\u202e' },
      'copy'
    ),
    false
  );
  assert.deepEqual(writes, []);

  assert.equal(
    writeTaskboardComposerDrag(
      {
        effectAllowed: 'none',
        setData() {
          throw new Error('blocked');
        }
      },
      item,
      'copy'
    ),
    false
  );
});
