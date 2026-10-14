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
  assert.equal(parseEmpiricalStatus({ ...document, revision: Number.MAX_SAFE_INTEGER + 1 }).kind, 'unavailable');
  assert.equal(parseEmpiricalStatus({ ...document, completion: { highest: 'verified', verified: 'yes' } }).kind, 'unavailable');
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

const overview = {
  schemaVersion: 1, root: '/repo/worktrees/a', truncated: false, issues: [],
  worktrees: [{ root: '/repo/worktrees/a', selectedFeature: 'task-1', selection: 'valid' }],
  specs: [{ feature: 'task-1', owners: ['/repo/worktrees/a'], ownership: 'selected',
    copies: [{ root: '/repo/worktrees/a', phase: 'verify', status: 'waiting', revision: 7,
      completionLevel: 'implemented', verification: 'pending', nextAction: 'Run selected checks',
      merged: false, valid: true }] }]
};

test('reads only the supplied checkout with bounded read-only commands', async () => {
  const result = await readEmpiricalStatus('/repo/worktrees/a', async (file, args, options) => {
    assert.equal(file, 'empirical');
    assert.deepEqual(args.slice(2), ['--root', '/repo/worktrees/a', '--json']);
    assert.ok(['status', 'overview'].includes(args[1]!));
    assert.equal(options.timeout, args[1] === 'status' ? 15_000 : 120_000);
    return { stdout: JSON.stringify(args[1] === 'status' ? document : overview) };
  });
  assert.equal(result.kind, 'feature');
  assert.equal((await readEmpiricalStatus('/repo/worktrees/a', async (_file, args) =>
    ({ stdout: JSON.stringify(args[1] === 'status' ? document : overview) }))).kind, 'feature');
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

test('gets the next action and completion projection from an older status', async () => {
  const result = await readEmpiricalStatus('/repo/worktrees/legacy', async (_file, args) =>
    ({ stdout: JSON.stringify(args[1] === 'status' ? { ...document, roadmap: undefined }
      : args[1] === 'next' ? { rationale: { nextAction: 'Continue verification' } }
        : overview) }));
  assert.equal(result.kind, 'feature');
  if (result.kind === 'feature') {
    assert.equal(result.nextAction, 'Continue verification');
    assert.equal(result.completionLevel, 'implemented');
    assert.equal(result.verification, 'pending');
  }
});

test('reports duplicate ownership and rejects invalid selected copies', async () => {
  const root = '/repo/worktrees/conflict';
  const read = (source: typeof overview) => readEmpiricalStatus(root,
    async (_file, args) => ({ stdout: JSON.stringify(args[1] === 'status' ? document : {
      ...source, root, worktrees: [{ ...source.worktrees[0], root }],
      specs: [{ ...source.specs[0], copies: [{ ...source.specs[0]!.copies[0], root }] }]
    }) }));
  const conflict = structuredClone(overview);
  conflict.specs[0]!.ownership = 'conflict';
  conflict.specs[0]!.owners.push('/repo/worktrees/b');
  await read(conflict);
  const result = await read(conflict);
  assert.equal(result.kind, 'feature');
  if (result.kind === 'feature') assert.equal(result.ownership, 'conflict');
  const invalidRoot = '/repo/worktrees/invalid';
  const invalid = structuredClone(overview);
  invalid.specs[0]!.copies[0]!.valid = false;
  await readEmpiricalStatus(invalidRoot, async (_file, args) =>
    ({ stdout: JSON.stringify(args[1] === 'status' ? document : {
      ...invalid, root: invalidRoot,
      worktrees: [{ ...invalid.worktrees[0], root: invalidRoot }],
      specs: [{ ...invalid.specs[0], copies: [{ ...invalid.specs[0]!.copies[0], root: invalidRoot }] }]
    }) }));
  assert.equal((await readEmpiricalStatus(invalidRoot, async () =>
    ({ stdout: JSON.stringify(document) }))).kind, 'invalid');
});

test('rejects malformed overview JSON instead of trusting a cast', async () => {
  const root = '/repo/worktrees/malformed';
  const read = () => readEmpiricalStatus(root, async (_file, args) => ({
    stdout: JSON.stringify(args[1] === 'status' ? document : { ...overview, specs: 'not-an-array' })
  }));
  await read();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await read()).kind, 'invalid');
});
