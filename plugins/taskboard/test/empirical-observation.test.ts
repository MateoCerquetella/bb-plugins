import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  empiricalObservationAt,
  projectEmpiricalCheckout,
  receiveEmpiricalObservation,
  type EmpiricalLiveObservation,
  type EmpiricalOverview
} from '../empirical/observation.ts';

const root = '/repo/worktrees/task-1';

function overview(
  changes: Partial<EmpiricalOverview['specs'][number]['copies'][number]> = {}
): EmpiricalOverview {
  return {
    schemaVersion: 1,
    root,
    truncated: false,
    worktrees: [{ root, selectedFeature: 'task-1', selection: 'valid' }],
    specs: [{
      feature: 'task-1',
      owners: [root],
      ownership: 'selected',
      copies: [{
        root,
        phase: 'implement',
        status: 'waiting',
        revision: 3,
        completionLevel: 'none',
        verification: 'pending',
        nextAction: 'Resume implement',
        merged: false,
        valid: true,
        ...changes
      }]
    }],
    issues: []
  };
}

test('binds the exact checkout and rejects a mismatched or omitted root', () => {
  assert.throws(() => projectEmpiricalCheckout(overview(), '/another'), /does not match/);
  const missing = overview();
  missing.worktrees = [];
  assert.throws(() => projectEmpiricalCheckout(missing, root), /omitted/);
});

test('keeps implementation distinct from verified completion', () => {
  const implemented = projectEmpiricalCheckout(overview({
    phase: 'done', status: 'done', completionLevel: 'implemented',
    verification: 'pending'
  }), root);
  assert.equal(implemented.kind, 'feature');
  if (implemented.kind !== 'feature') return;
  assert.equal(implemented.verifiedDone, false);
  assert.equal(implemented.completionLevel, 'implemented');

  const verified = projectEmpiricalCheckout(overview({
    phase: 'done', status: 'done', completionLevel: 'verified',
    verification: 'verified'
  }), root);
  assert.equal(verified.kind, 'feature');
  if (verified.kind !== 'feature') return;
  assert.equal(verified.verifiedDone, true);
});

test('reports merged-but-unclosed and conflicting ownership without choosing another copy', () => {
  const input = overview({ merged: true, verification: 'verified' });
  input.specs[0]!.owners.push('/repo/worktrees/task-2');
  input.specs[0]!.ownership = 'conflict';
  input.specs[0]!.copies.push({
    ...input.specs[0]!.copies[0]!,
    root: '/repo/worktrees/task-2',
    revision: 8
  });
  const result = projectEmpiricalCheckout(input, root);
  assert.equal(result.kind, 'feature');
  if (result.kind !== 'feature') return;
  assert.equal(result.revision, 3);
  assert.equal(result.ownership, 'conflict');
  assert.equal(result.owners.length, 2);
  assert.equal(result.mergedButUnclosed, true);
  assert.equal(result.verifiedDone, false);
});

test('distinguishes no selection from invalid or truncated data', () => {
  const empty = overview();
  empty.worktrees[0]!.selectedFeature = null;
  assert.equal(projectEmpiricalCheckout(empty, root).kind, 'none');

  const invalid = overview();
  invalid.specs[0]!.copies[0]!.valid = false;
  assert.equal(projectEmpiricalCheckout(invalid, root).kind, 'invalid');

  const truncated = overview();
  truncated.truncated = true;
  assert.equal(projectEmpiricalCheckout(truncated, root).kind, 'invalid');
});

test('rejects a different host, environment, checkout, or older update', () => {
  const identity = { hostId: 'host-a', environmentId: 'env-a', checkoutRoot: root };
  const initial: EmpiricalLiveObservation = { kind: 'unobserved', identity };
  for (const change of [
    { hostId: 'host-b' },
    { environmentId: 'env-b' },
    { checkoutRoot: '/another' }
  ]) {
    assert.throws(() => receiveEmpiricalObservation(initial, {
      ...identity, ...change
    }, overview(), 100), /identity or time/);
  }
  const received = receiveEmpiricalObservation(initial, identity, overview(), 100);
  assert.throws(() => receiveEmpiricalObservation(received, identity, overview(), 99),
    /identity or time/);
});

test('retains last good state as stale on timeout or disconnect, then recovers', () => {
  const identity = { hostId: 'host-a', environmentId: 'env-a', checkoutRoot: root };
  const initial: EmpiricalLiveObservation = { kind: 'unobserved', identity };
  const received = receiveEmpiricalObservation(initial, identity, overview(), 100);
  assert.equal(empiricalObservationAt(received, identity, 150, 50).kind, 'observed');
  const stale = empiricalObservationAt(received, identity, 151, 50);
  assert.equal(stale.kind, 'stale');
  const disconnected = empiricalObservationAt(received, identity, 120, 50, 'Host offline');
  assert.equal(disconnected.kind, 'stale');
  if (disconnected.kind === 'unobserved') return;
  assert.equal(disconnected.reason, 'Host offline');
  assert.equal(disconnected.state.kind, 'feature');
  const recovered = receiveEmpiricalObservation(disconnected, identity,
    overview({ phase: 'verify', revision: 4 }), 200);
  assert.equal(recovered.kind, 'observed');
  if (recovered.kind === 'unobserved') return;
  assert.equal(recovered.state.kind, 'feature');
  if (recovered.state.kind === 'feature') assert.equal(recovered.state.revision, 4);
});
