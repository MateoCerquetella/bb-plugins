import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEmpiricalStatus, readEmpiricalStatus } from '../empirical/status.ts';

const document = {
  schemaVersion: 5,
  activeFeature: 'task-1',
  revision: 7,
  phase: 'verify',
  status: 'waiting',
  roadmap: {
    nextAction: 'Run selected checks',
    checks: [{ gate: 'verify', state: 'unrun' }]
  },
  completion: { highest: 'implemented', verified: false }
};

test('projects durable completion separately from phase and provider activity', () => {
  assert.deepEqual(parseEmpiricalStatus(document), {
    kind: 'feature', feature: 'task-1', revision: 7,
    phase: 'verify', status: 'waiting', nextAction: 'Run selected checks',
    verification: 'pending', completionLevel: 'implemented',
    completionMethod: null
  });
  assert.equal(parseEmpiricalStatus({ ...document, activeFeature: null }).kind, 'empty');
  assert.equal(parseEmpiricalStatus({ ...document, revision: '7' }).kind, 'unavailable');
  const legacy = parseEmpiricalStatus({ ...document, roadmap: undefined });
  if (legacy.kind === 'feature') {
    assert.match(legacy.nextAction, /Unavailable/);
    assert.equal(legacy.verification, 'pending');
  }
  assert.equal(parseEmpiricalStatus({
    ...document, completion: { highest: 'verified', verified: true }
  }).kind, 'feature');
  const skipped = parseEmpiricalStatus({
    ...document, roadmap: {
      ...document.roadmap, checks: [{ gate: 'verify', state: 'skipped' }]
    }
  });
  if (skipped.kind === 'feature') assert.equal(skipped.verification, 'skipped');
});

test('reads only the supplied checkout with a bounded read-only command', async () => {
  const result = await readEmpiricalStatus('/repo/worktrees/a', async (file, args, options) => {
    assert.equal(file, 'empirical');
    assert.deepEqual(args, ['__internal', 'status', '--root', '/repo/worktrees/a', '--json']);
    assert.equal(options.timeout, 15_000);
    return { stdout: JSON.stringify(document) };
  });
  assert.equal(result.kind, 'feature');
});

test('distinguishes uninitialized from transient failure', async () => {
  const missing = await readEmpiricalStatus('/repo', async () => {
    throw new Error('PROJECT_NOT_INITIALIZED');
  });
  assert.equal(missing.kind, 'uninitialized');
  const failed = await readEmpiricalStatus('/repo', async () => {
    throw new Error('ETIMEDOUT');
  });
  assert.equal(failed.kind, 'unavailable');
});
