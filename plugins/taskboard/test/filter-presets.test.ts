import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultBoardFilterState } from '../filter-state.ts';
import {
  filterPresetSchema,
  normalizePresetName,
  resolvePresetOrder
} from '../filter-presets.ts';

test('normalizes names for collision checks', () => {
  assert.equal(normalizePresetName('  My Work '), 'my work');
  assert.equal(normalizePresetName('MY WORK'), normalizePresetName('my work'));
});

test('accepts a valid preset', () => {
  const preset = filterPresetSchema.parse({
    id: 'fp_1',
    projectId: 'proj_alpha',
    name: 'My work',
    state: defaultBoardFilterState(),
    position: 0
  });
  assert.equal(preset.name, 'My work');
});

test('rejects empty and overlong names', () => {
  const base = {
    id: 'fp_1',
    projectId: 'proj_alpha',
    state: defaultBoardFilterState(),
    position: 0
  };
  assert.throws(() => filterPresetSchema.parse({ ...base, name: '   ' }));
  assert.throws(() =>
    filterPresetSchema.parse({ ...base, name: 'x'.repeat(61) })
  );
});

test('resolves a reorder that lists every preset once', () => {
  assert.deepEqual(
    resolvePresetOrder(['a', 'b', 'c'], ['c', 'a', 'b']),
    ['c', 'a', 'b']
  );
});

test('rejects incomplete, unknown, and duplicated reorders', () => {
  assert.throws(() => resolvePresetOrder(['a', 'b'], ['a']));
  assert.throws(() => resolvePresetOrder(['a', 'b'], ['a', 'z']));
  assert.throws(() => resolvePresetOrder(['a', 'b'], ['a', 'a']));
});

test('normalization is locale-independent', () => {
  // name_normalized is persisted and backs a UNIQUE constraint, so it must
  // produce the same bytes on every machine. Pin the expected codepoints
  // rather than comparing two implementations: U+0130 lowercases to
  // 'i' + U+0307 under Unicode's locale-independent mapping, but to a bare
  // 'i' under tr-TR. Note this assertion cannot fail on a host whose locale
  // already agrees with the default mapping; it is here to fail loudly on a
  // Turkish host if someone reintroduces toLocaleLowerCase.
  assert.equal(normalizePresetName('\u0130'), 'i\u0307');
  assert.equal(normalizePresetName('  \u0130S  '), 'i\u0307s');
});
