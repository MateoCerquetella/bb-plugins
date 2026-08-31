#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  fileURLToPath(new URL('..', import.meta.url))
);
const cliArguments = process.argv.slice(2);
if (
  cliArguments.length > 1 ||
  cliArguments.some(argument => argument !== '--allow-working-tree')
) {
  throw new Error(
    'Usage: verify-taskboard-release-candidate.mjs [--allow-working-tree]'
  );
}
const allowWorkingTree = cliArguments[0] === '--allow-working-tree';

function run(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options
  });
}

const productDiff = execFileSync(
  'git',
  ['diff', 'HEAD', '--binary', '--', '.', ':(exclude).empirical'],
  { cwd: repositoryRoot }
);
const untrackedProductFiles = execFileSync(
  'git',
  [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    '.',
    ':(exclude).empirical'
  ],
  { cwd: repositoryRoot, encoding: 'utf8' }
)
  .split('\n')
  .filter(Boolean);
if (
  !allowWorkingTree &&
  (productDiff.length > 0 || untrackedProductFiles.length > 0)
) {
  throw new Error(
    'Committed-only Taskboard release verification refuses tracked or untracked product changes. Commit the exact candidate first, or use --allow-working-tree only for a non-authoritative development probe.'
  );
}

const headCommit = execFileSync(
  'git',
  ['rev-parse', '--verify', 'HEAD^{commit}'],
  { cwd: repositoryRoot, encoding: 'utf8' }
).trim();
const headTree = execFileSync(
  'git',
  ['rev-parse', '--verify', 'HEAD^{tree}'],
  { cwd: repositoryRoot, encoding: 'utf8' }
).trim();

run('npm', ['run', 'check']);

const candidateRoot = mkdtempSync(
  join(tmpdir(), 'taskboard-qa-consumer-')
);
const cloneRoot = join(candidateRoot, 'repo');
run('git', ['clone', '--no-local', '--quiet', repositoryRoot, cloneRoot]);
const cloneCommit = execFileSync(
  'git',
  ['rev-parse', '--verify', 'HEAD^{commit}'],
  { cwd: cloneRoot, encoding: 'utf8' }
).trim();
const cloneTree = execFileSync(
  'git',
  ['rev-parse', '--verify', 'HEAD^{tree}'],
  { cwd: cloneRoot, encoding: 'utf8' }
).trim();
if (cloneCommit !== headCommit || cloneTree !== headTree) {
  throw new Error(
    'Clean consumer clone does not match the candidate commit and tree'
  );
}
if (allowWorkingTree && productDiff.length > 0) {
  execFileSync(
    'git',
    ['apply', '--whitespace=nowarn', '-'],
    { cwd: cloneRoot, input: productDiff }
  );
}

if (allowWorkingTree) {
  for (const relativePath of untrackedProductFiles) {
    const normalizedPath = normalize(relativePath);
    if (
      isAbsolute(normalizedPath) ||
      normalizedPath === '..' ||
      normalizedPath.startsWith(
        `..${process.platform === 'win32' ? '\\' : '/'}`
      )
    ) {
      throw new Error(`Unsafe untracked candidate path: ${relativePath}`);
    }
    const sourcePath = resolve(repositoryRoot, normalizedPath);
    if (!lstatSync(sourcePath).isFile()) {
      throw new Error(
        `Untracked candidate is not a regular file: ${relativePath}`
      );
    }
    const destinationPath = resolve(cloneRoot, normalizedPath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourcePath, destinationPath);
  }
}

const taskboardRoot = join(cloneRoot, 'plugins', 'taskboard');
if (existsSync(join(cloneRoot, 'node_modules'))) {
  throw new Error('Clean consumer unexpectedly has root node_modules');
}

run(
  'npm',
  [
    'install',
    '--prefix',
    taskboardRoot,
    '--ignore-scripts',
    '--omit=dev',
    '--omit=optional',
    '--no-audit',
    '--no-fund'
  ],
  {
    cwd: cloneRoot,
    env: { ...process.env, NODE_ENV: 'production' }
  }
);

if (existsSync(join(cloneRoot, 'node_modules'))) {
  throw new Error('Production subdirectory install created root node_modules');
}
if (
  existsSync(
    join(taskboardRoot, 'node_modules', '@get-bb', 'plugin-sdk')
  )
) {
  throw new Error('Production subdirectory install included the dev-only SDK');
}

const buildEnvironment = { ...process.env };
delete buildEnvironment.BB_CLI;
run('bb', ['plugin', 'build', '.'], {
  cwd: taskboardRoot,
  env: buildEnvironment
});
run('node', ['scripts/verify-build.mjs'], { cwd: taskboardRoot });

process.stdout.write(
  allowWorkingTree
    ? `Verified non-authoritative Taskboard working-tree consumer over ${headCommit} (${headTree}) at ${cloneRoot}\n`
    : `Verified committed Taskboard consumer ${headCommit} (${headTree}) at ${cloneRoot}\n`
);
