import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { parseVerificationCommands } from '../execution/commands.ts';

const exec = promisify(execFile);
const helper = fileURLToPath(
  new URL(
    '../execution/engines/symphony/runtime/workspace.mjs',
    import.meta.url
  )
);

test('verification commands preserve quoted argv and never interpret shell operators', () => {
  assert.deepEqual(
    parseVerificationCommands('npm test\nnode "my test.js"')[1]!.argv,
    ['node', 'my test.js']
  );
  assert.throws(
    () => parseVerificationCommands('npm test && deploy'),
    /shell operators/
  );
  assert.throws(() => parseVerificationCommands('node "unfinished'), /quoted/);
  assert.equal(parseVerificationCommands('echo $TOKEN')[0]!.argv[1], '$TOKEN');
});

test('real workspace hook initializes context, preserves retries, seeds fixes, and rejects missing branches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'taskboard-workspaces-'));
  const source = join(root, 'source');
  await mkdir(source);
  const git = async (cwd: string, ...args: string[]) =>
    (await exec('git', args, { cwd })).stdout.trim();
  await git(source, 'init', '-b', 'main');
  await git(source, 'config', 'user.name', 'Test');
  await git(source, 'config', 'user.email', 'test@example.invalid');
  await writeFile(join(source, 'file.txt'), 'base\n');
  await git(source, 'add', '.');
  await git(source, '-c', 'commit.gpgsign=false', 'commit', '-m', 'base');
  const baseRevision = await git(source, 'rev-parse', 'HEAD');
  const id = `tb_${'b'.repeat(32)}`;
  const secondId = `tb_${'c'.repeat(32)}`;
  let context: any = {
    schemaVersion: 1,
    executionId: id,
    generation: 1,
    digest: 'fixture-digest',
    approvedScope: {
      repository: source,
      branch: 'bb/work',
      baseBranch: 'main',
      baseRevision,
      plan: 'Approved work',
      acceptanceCriteria: ['Works'],
      verificationRequirements: []
    },
    taskReference: { description: 'External reference' },
    parent: null,
    instructions: 'Return to Taskboard for verification'
  };
  const server = createServer((req, res) => {
    assert.equal(req.headers['x-bb-plugin-token'], 'fixture-token');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(context));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const env = {
    PATH: process.env.PATH,
    TASKBOARD_WORKSPACE_ROOT: root,
    TASKBOARD_URL: `http://127.0.0.1:${port}`,
    TASKBOARD_TOKEN: 'fixture-token'
  };
  const runHelper = (cwd: string) =>
    exec(process.execPath, [helper], { cwd, env, timeout: 30000 });
  try {
    const workspace = join(root, id);
    await mkdir(workspace);
    await runHelper(workspace);
    assert.equal(
      await git(workspace, 'symbolic-ref', '--short', 'HEAD'),
      'bb/work'
    );
    const stored = await readFile(
      join(workspace, '.taskboard/execution-context.json'),
      'utf8'
    );
    assert.equal(JSON.parse(stored).digest, 'fixture-digest');
    assert.equal(stored.includes('fixture-token'), false);
    assert.equal(await git(workspace, 'status', '--porcelain'), '');
    await writeFile(join(workspace, 'file.txt'), 'implementation\n');
    await runHelper(workspace);
    assert.equal(
      await readFile(join(workspace, 'file.txt'), 'utf8'),
      'implementation\n'
    );
    await git(workspace, 'add', '.');
    await git(
      workspace,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'implementation'
    );
    const head = await git(workspace, 'rev-parse', 'HEAD');
    context = {
      ...context,
      executionId: secondId,
      parent: { workspace, head }
    };
    const fixWorkspace = join(root, secondId);
    await mkdir(fixWorkspace);
    await runHelper(fixWorkspace);
    assert.equal(await git(fixWorkspace, 'rev-parse', 'HEAD'), head);
    assert.equal(
      await git(fixWorkspace, 'remote', 'get-url', 'origin'),
      source
    );
    await git(fixWorkspace, 'checkout', '--detach');
    await assert.rejects(runHelper(fixWorkspace));
    const missing = join(root, `tb_${'d'.repeat(32)}`);
    await mkdir(missing);
    context = {
      ...context,
      executionId: `tb_${'d'.repeat(32)}`,
      parent: null,
      approvedScope: {
        ...context.approvedScope,
        repository: join(root, 'missing-repository')
      }
    };
    await assert.rejects(runHelper(missing));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
