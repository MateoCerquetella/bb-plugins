import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import {
  ACROSS_PROJECTS_SCOPE_ID,
  boardFilterStateFingerprint,
  boardFilterStateSchema,
  defaultBoardFilterState,
  filterStateScopeId,
  normalizeBoardFilterState
} from '../filter-state.ts';
import type { BoardFilterState } from '../filter-state.ts';

function state(overrides: Partial<BoardFilterState> = {}): BoardFilterState {
  return { ...defaultBoardFilterState(), ...overrides };
}

test('parses a complete filter state', () => {
  const parsed = boardFilterStateSchema.parse({
    source: 'linear',
    stateCategories: ['todo'],
    statuses: ['In Progress'],
    assignees: ['Andrii Los'],
    priorities: ['High'],
    externalProjects: ['Platform'],
    labels: ['bug'],
    query: 'flake',
    view: 'kanban'
  });
  assert.equal(parsed.source, 'linear');
  assert.deepEqual(parsed.assignees, ['Andrii Los']);
});

test('rejects unknown keys, including committedQuery', () => {
  const result = boardFilterStateSchema.safeParse({
    ...defaultBoardFilterState(),
    committedQuery: 'flake'
  });
  assert.equal(result.success, false);
  assert.equal(
    (result.error as z.ZodError).issues[0]?.code,
    'unrecognized_keys'
  );
});

test('collapses every surface scope key to one storage key', () => {
  assert.equal(filterStateScopeId('proj_alpha'), 'proj_alpha');
  assert.equal(filterStateScopeId('right-panel:proj_alpha'), 'proj_alpha');
  assert.equal(filterStateScopeId('across-projects'), ACROSS_PROJECTS_SCOPE_ID);
  assert.equal(
    filterStateScopeId('right-panel:across-projects'),
    ACROSS_PROJECTS_SCOPE_ID
  );
});

test('leaves an empty scope unaliased for the RPC boundary to reject', () => {
  // filterStateScopeId does not special-case '' onto the across-projects
  // row; both of these are rejected downstream by bbProjectIdSchema
  // (startsWith('proj_')), the same as any other malformed scope.
  assert.equal(filterStateScopeId(''), '');
  assert.equal(filterStateScopeId('right-panel:'), '');
});

test('normalizes every array field independently and trims the query', () => {
  const normalized = normalizeBoardFilterState(
    state({
      stateCategories: ['todo', 'backlog', 'todo'],
      statuses: ['Todo', 'Backlog', 'Todo'],
      assignees: ['Bob', 'Alice', 'Bob'],
      priorities: ['Low', 'High', 'Low'],
      externalProjects: ['Web', 'Api', 'Web'],
      labels: ['ui', 'bug', 'ui'],
      query: '  flake  '
    })
  );
  assert.deepEqual(normalized.stateCategories, ['backlog', 'todo']);
  assert.deepEqual(normalized.statuses, ['Backlog', 'Todo']);
  assert.deepEqual(normalized.assignees, ['Alice', 'Bob']);
  assert.deepEqual(normalized.priorities, ['High', 'Low']);
  assert.deepEqual(normalized.externalProjects, ['Api', 'Web']);
  assert.deepEqual(normalized.labels, ['bug', 'ui']);
  assert.equal(normalized.query, 'flake');
});

test('fingerprints ignore array order', () => {
  assert.equal(
    boardFilterStateFingerprint(state({ labels: ['ui', 'bug'] })),
    boardFilterStateFingerprint(state({ labels: ['bug', 'ui'] }))
  );
  assert.notEqual(
    boardFilterStateFingerprint(state({ labels: ['ui'] })),
    boardFilterStateFingerprint(state({ labels: ['bug'] }))
  );
});
