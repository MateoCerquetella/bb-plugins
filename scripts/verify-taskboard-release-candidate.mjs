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

function run(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options
  });
}

run('npm', ['run', 'check']);

const candidateRoot = mkdtempSync(
  join(tmpdir(), 'taskboard-qa-consumer-')
);
const cloneRoot = join(candidateRoot, 'repo');
run('git', ['clone', '--no-local', '--quiet', repositoryRoot, cloneRoot]);

const productDiff = execFileSync(
  'git',
  ['diff', 'HEAD', '--binary', '--', '.', ':(exclude).empirical'],
  { cwd: repositoryRoot }
);
if (productDiff.length > 0) {
  execFileSync(
    'git',
    ['apply', '--whitespace=nowarn', '-'],
    { cwd: cloneRoot, input: productDiff }
  );
}

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
for (const relativePath of untrackedProductFiles) {
  const normalizedPath = normalize(relativePath);
  if (
    isAbsolute(normalizedPath) ||
    normalizedPath === '..' ||
    normalizedPath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new Error(`Unsafe untracked candidate path: ${relativePath}`);
  }
  const sourcePath = resolve(repositoryRoot, normalizedPath);
  if (!lstatSync(sourcePath).isFile()) {
    throw new Error(`Untracked candidate is not a regular file: ${relativePath}`);
  }
  const destinationPath = resolve(cloneRoot, normalizedPath);
  mkdirSync(dirname(destinationPath), { recursive: true });
  copyFileSync(sourcePath, destinationPath);
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

process.stdout.write(`Verified clean Taskboard consumer at ${cloneRoot}\n`);
