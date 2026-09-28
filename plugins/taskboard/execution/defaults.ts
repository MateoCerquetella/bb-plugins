import { command } from './verification.js';

async function tryGit(cwd: string, ...args: string[]): Promise<string | null> {
  try {
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
    return result.passed ? result.output : null;
  } catch {
    return null;
  }
}

function preferredBranch(branches: string[]): string | null {
  const unique = [...new Set(branches.map(branch => branch.trim()))].filter(
    Boolean
  );
  return (
    unique.find(branch => branch === 'main') ??
    unique.find(branch => branch === 'master') ??
    unique.sort((left, right) => left.localeCompare(right))[0] ??
    null
  );
}

export async function resolveExecutionDefaults(repository: string): Promise<{
  repository: string;
  baseBranch: string;
  baseRevision: string;
}> {
  const topLevel = await tryGit(repository, 'rev-parse', '--show-toplevel');
  if (!topLevel)
    throw new Error(
      'Repository: configure an accessible Git repository for this BB project'
    );

  const baseRevision = await tryGit(repository, 'rev-parse', 'HEAD');
  if (!baseRevision)
    throw new Error(
      'Repository: create an initial commit before starting managed execution'
    );

  let baseBranch = await tryGit(
    repository,
    'symbolic-ref',
    '--quiet',
    '--short',
    'HEAD'
  );
  if (!baseBranch) {
    const exactLocal = await tryGit(
      repository,
      'for-each-ref',
      '--format=%(refname:short)',
      '--points-at',
      baseRevision,
      'refs/heads'
    );
    baseBranch = preferredBranch(exactLocal?.split('\n') ?? []);
  }
  if (!baseBranch) {
    const remoteHead = await tryGit(
      repository,
      'symbolic-ref',
      '--quiet',
      '--short',
      'refs/remotes/origin/HEAD'
    );
    baseBranch = remoteHead?.replace(/^origin\//, '') || null;
  }
  if (!baseBranch) {
    const remoteBranches = await tryGit(
      repository,
      'for-each-ref',
      '--format=%(refname:short)',
      '--contains',
      baseRevision,
      'refs/remotes/origin'
    );
    baseBranch = preferredBranch(
      (remoteBranches?.split('\n') ?? [])
        .filter(branch => branch !== 'origin/HEAD')
        .map(branch => branch.replace(/^origin\//, ''))
    );
  }
  if (!baseBranch) {
    baseBranch = await tryGit(
      repository,
      'config',
      '--get',
      'init.defaultBranch'
    );
  }
  if (!baseBranch)
    throw new Error(
      'Base branch: attach the project checkout to a branch or configure origin/HEAD'
    );

  return { repository, baseBranch, baseRevision };
}
