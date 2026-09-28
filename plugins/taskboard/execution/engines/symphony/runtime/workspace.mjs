import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const cwd = await realpath(process.cwd());
const id = basename(cwd);
const root = await realpath(process.env.TASKBOARD_WORKSPACE_ROOT || '');
if (!/^tb_[a-f0-9]{32}$/.test(id) || dirname(cwd) !== root)
  throw new Error('Invalid Taskboard workspace');
const endpoint = new URL(process.env.TASKBOARD_URL || '');
if (
  !['http:', 'https:'].includes(endpoint.protocol) ||
  endpoint.username ||
  endpoint.password
)
  throw new Error('Invalid Taskboard URL');
endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + `/context/${id}`;
const response = await fetch(endpoint, {
  headers: { 'x-bb-plugin-token': process.env.TASKBOARD_TOKEN || '' },
  redirect: 'error',
  signal: AbortSignal.timeout(10000)
});
if (!response.ok)
  throw new Error(`Taskboard context unavailable (${response.status})`);
const context = await response.json();
if (context.executionId !== id || context.schemaVersion !== 1)
  throw new Error('Invalid execution context');
const scope = context.approvedScope;
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SSH_AUTH_SOCK'].flatMap(key =>
    process.env[key] ? [[key, process.env[key]]] : []
  )
);
const git = (...args) =>
  execFileSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args],
    {
      cwd,
      env: { ...env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 120000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  ).trim();
if (!existsSync(join(cwd, '.git'))) {
  let source = scope.repository;
  let revision = scope.baseRevision;
  if (context.parent) {
    const parent = await realpath(context.parent.workspace);
    if (dirname(parent) !== root || !/^tb_[a-f0-9]{32}$/.test(basename(parent)))
      throw new Error('Invalid fix workspace');
    source = parent;
    revision = context.parent.head;
  }
  if (!revision || !/^[a-f0-9]{40,64}$/.test(revision))
    throw new Error('Missing approved revision');
  git('clone', '--no-hardlinks', '--no-checkout', '--', source, '.');
  git('remote', 'set-url', 'origin', scope.repository);
  git('show-ref', '--verify', `refs/remotes/origin/${scope.baseBranch}`);
  git('switch', '-C', scope.branch, revision);
} else {
  if (git('symbolic-ref', '--short', 'HEAD') !== scope.branch)
    throw new Error('Approved branch was deleted or changed');
  if (git('remote', 'get-url', 'origin') !== scope.repository)
    throw new Error('Repository does not match approved scope');
}
git('merge-base', '--is-ancestor', scope.baseRevision, 'HEAD');
const exclude = resolve(cwd, git('rev-parse', '--git-path', 'info/exclude'));
const previous = existsSync(exclude) ? await readFile(exclude, 'utf8') : '';
if (!previous.split('\n').includes('/.taskboard/'))
  await writeFile(exclude, `${previous}\n/.taskboard/\n`);
await mkdir(join(cwd, '.taskboard'), { recursive: true });
await writeFile(
  join(cwd, '.taskboard/execution-context.json'),
  JSON.stringify(context, null, 2) + '\n',
  { mode: 0o600 }
);
console.log('Taskboard execution context initialized');
