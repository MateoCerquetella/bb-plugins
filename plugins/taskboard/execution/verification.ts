import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import type { CheckResult, ExecutionRun } from './contract.js';

export async function command(
  argv: string[],
  cwd: string,
  timeoutMs = 30_000,
  signal?: AbortSignal
): Promise<{ passed: boolean; output: string }> {
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(
      ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SystemRoot'].flatMap(key =>
        process.env[key] ? [[key, process.env[key]!]] : []
      )
    );
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd,
      env: { ...env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });
    let output = '';
    let timedOut = false;
    const collect = (data: Buffer) => {
      if (output.length < 32_000)
        output += data.toString('utf8').slice(0, 32_000 - output.length);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const stop = () => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid)
          process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        /* Already exited. */
      }
    };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    };
    child.on('error', error => {
      cleanup();
      reject(error);
    });
    child.on('close', code => {
      cleanup();
      resolve({
        passed: code === 0 && !timedOut,
        output: timedOut ? 'Required check stopped or timed out' : output.trim()
      });
    });
  });
}
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await command(
    [
      'git',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      ...args
    ],
    cwd
  );
  if (!result.passed) throw new Error(`Git validation failed: ${args[0]}`);
  return result.output;
}
export async function inspectWorkspace(run: ExecutionRun): Promise<string> {
  const root = await realpath(dirname(run.workspace));
  const path = await realpath(run.workspace);
  if (basename(path) !== run.id || path !== join(root, run.id))
    throw new Error('Workspace escapes the configured execution root');
  if ((await git(path, 'rev-parse', '--show-toplevel')) !== path)
    throw new Error('Execution workspace is not a repository root');
  if (
    (await realpath(await git(path, 'rev-parse', '--absolute-git-dir'))) !==
    join(path, '.git')
  )
    throw new Error('Execution Git metadata must stay inside its workspace');
  if (
    (await git(path, 'remote', 'get-url', 'origin')) !==
    run.request.scope.repository
  )
    throw new Error('Workspace repository does not match approved request');
  if (
    (await git(path, 'symbolic-ref', '--short', 'HEAD')) !==
    run.request.scope.branch
  )
    throw new Error('Approved branch was deleted or changed');
  if (await git(path, 'status', '--porcelain', '--untracked-files=normal'))
    throw new Error('Commit implementation changes before verification');
  const head = await git(path, 'rev-parse', 'HEAD');
  if (head !== run.head)
    throw new Error(
      'Implementation revision changed; a new handoff is required'
    );
  await git(
    path,
    'merge-base',
    '--is-ancestor',
    run.request.scope.baseRevision,
    head
  );
  return head;
}
export async function verifyExecution(
  run: ExecutionRun,
  signal?: AbortSignal
): Promise<{ head: string; checks: CheckResult[] }> {
  if (!run.runtimeReleased || !run.head)
    throw new Error(
      'Wait for Symphony to release the implementation workspace'
    );
  const head = await inspectWorkspace(run);
  const checks: CheckResult[] = [];
  for (const check of run.request.scope.verificationRequirements) {
    const content = check.inputs.length
      ? await git(run.workspace, 'ls-tree', '-r', head, '--', ...check.inputs)
      : await git(run.workspace, 'rev-parse', `${head}^{tree}`);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([run.digest, check, content]))
      .digest('hex');
    const cached = run.checks.find(
      result =>
        result.id === check.id &&
        result.fingerprint === fingerprint &&
        result.passed
    );
    if (cached) checks.push({ ...cached, reused: true });
    else {
      let result;
      try {
        result = await command(
          check.argv,
          run.workspace,
          check.timeoutMs,
          signal
        );
      } catch {
        result = {
          passed: false,
          output: 'Required check could not be started'
        };
      }
      checks.push({
        id: check.id,
        fingerprint,
        ...result,
        reused: false,
        finishedAt: new Date().toISOString()
      });
    }
    await inspectWorkspace(run);
  }
  return { head, checks };
}
