import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EmpiricalError } from 'empirical-sdd';
import { readEmpiricalStatus } from '../empirical/status.ts';
import type { EmpiricalOverview } from '../empirical/observation.ts';

const root = '/repo/worktrees/a';
const feature = 'task-1';
const overview = (): EmpiricalOverview => ({
  schemaVersion: 1, root, truncated: false, issues: [],
  worktrees: [{ root, selectedFeature: feature, selection: 'valid' }],
  specs: [{ feature, owners: [root], ownership: 'selected',
    copies: [{ root, phase: 'verify', status: 'waiting', revision: 7,
      completionLevel: 'implemented', verification: 'pending', nextAction: 'Run selected checks',
      merged: false, valid: true }] }]
});
const completion = async () => ({
  activeFeature: feature, revision: 7, phase: 'verify', status: 'waiting',
  completion: { highest: 'implemented', verified: false }
});

test('reads a checkout-consistent Empirical feature and its completion method', async () => {
  const input = overview();
  input.specs[0]!.ownership = 'conflict';
  input.specs[0]!.owners.push('/repo/worktrees/b');
  const result = await readEmpiricalStatus(root, 'env-a', async requested => {
    assert.equal(requested, root);
    return input;
  }, async requested => {
    assert.equal(requested, root);
    return { ...await completion(), completionRecord: { method: 'workflow' } };
  });
  assert.deepEqual(result, {
    environmentId: 'env-a', root,
    status: {
      kind: 'feature', feature, revision: 7, phase: 'verify', status: 'waiting',
      nextAction: 'Run selected checks', verification: 'pending',
      completionLevel: 'implemented', completionMethod: 'workflow',
      ownership: 'conflict', owners: [root, '/repo/worktrees/b'],
      mergedButUnclosed: false
    }
  });
});

test('rejects a changed checkout or feature before showing completion', async () => {
  const wrongRoot = await readEmpiricalStatus(root, 'env-a',
    async () => ({ ...overview(), root: '/another' }), completion);
  assert.equal(wrongRoot.status.kind, 'invalid');
  const changed = await readEmpiricalStatus(root, 'env-a',
    async () => overview(),
    async () => ({ ...await completion(), revision: 8 }));
  assert.equal(changed.status.kind, 'invalid');
});

test('does not reuse stale ownership or merged state', async () => {
  const first = overview();
  first.specs[0]!.copies[0]!.merged = true;
  const second = overview();
  second.specs[0]!.ownership = 'conflict';
  second.specs[0]!.owners.push('/repo/worktrees/b');
  const read = (source: EmpiricalOverview) =>
    readEmpiricalStatus(root, 'env-a', async () => source, completion);
  const merged = await read(first);
  const conflict = await read(second);
  assert.equal(merged.status.kind, 'feature');
  assert.equal(conflict.status.kind, 'feature');
  if (merged.status.kind === 'feature' && conflict.status.kind === 'feature') {
    assert.equal(merged.status.mergedButUnclosed, true);
    assert.equal(conflict.status.mergedButUnclosed, false);
    assert.deepEqual(conflict.status.owners, [root, '/repo/worktrees/b']);
  }
});

test('distinguishes empty, invalid, uninitialized and unavailable', async () => {
  const empty = overview();
  empty.worktrees[0]!.selectedFeature = null;
  assert.equal((await readEmpiricalStatus(root, 'env-a', async () => empty,
    async () => ({ ...await completion(), activeFeature: null }))).status.kind, 'empty');
  const invalid = overview();
  invalid.truncated = true;
  assert.equal((await readEmpiricalStatus(root, 'env-a', async () => invalid, completion)).status.kind, 'invalid');
  for (const source of [
    { ...overview(), specs: [{ feature }] },
    { ...overview(), schemaVersion: 2 },
    { ...overview(), worktrees: [] }
  ]) {
    const observation = await readEmpiricalStatus(root, 'env-a', async () => source, completion);
    assert.equal(observation.status.kind, 'invalid');
  }
  const uninitialized = await readEmpiricalStatus(root, 'env-a', async () => {
    throw new EmpiricalError('PROJECT_NOT_INITIALIZED', 'missing project');
  }, completion);
  assert.equal(uninitialized.status.kind, 'uninitialized');
  const unavailable = await readEmpiricalStatus(root, 'env-a', async () => {
    throw new Error('transient failure');
  }, completion);
  assert.equal(unavailable.status.kind, 'unavailable');
});
