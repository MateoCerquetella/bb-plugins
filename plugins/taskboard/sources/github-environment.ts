import path from 'node:path';

const GITHUB_CLI_ENV_KEYS = [
  'PATH',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'GH_HOST',
  'GH_CONFIG_DIR',
  'HOME',
  'XDG_CONFIG_HOME',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'TMPDIR',
  'TMP',
  'TEMP',
  'DBUS_SESSION_BUS_ADDRESS',
  'XDG_RUNTIME_DIR'
] as const;

const WINDOWS_GITHUB_CLI_DISCOVERY_ENV_KEYS = [
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'TMP',
  'TEMP'
] as const;

const WINDOWS_GITHUB_CLI_ENV_KEYS = [
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SystemRoot',
  'WINDIR',
  'PATHEXT',
  'COMSPEC'
] as const;

function environmentValue(
  source: NodeJS.ProcessEnv,
  key: string,
  platform: NodeJS.Platform
): string | undefined {
  if (platform !== 'win32') return source[key];
  const sourceKey = Object.keys(source).find(
    candidate => candidate.toLowerCase() === key.toLowerCase()
  );
  return sourceKey === undefined ? undefined : source[sourceKey];
}

export function buildGithubCliEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    LANG: 'C',
    LC_ALL: 'C',
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1'
  };
  const keys =
    platform === 'win32'
      ? [...GITHUB_CLI_ENV_KEYS, ...WINDOWS_GITHUB_CLI_ENV_KEYS]
      : GITHUB_CLI_ENV_KEYS;
  for (const key of keys) {
    const value = environmentValue(source, key, platform);
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

export function buildGithubCliDiscoveryEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    LANG: 'C',
    LC_ALL: 'C',
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1'
  };
  if (platform === 'win32') {
    for (const key of WINDOWS_GITHUB_CLI_DISCOVERY_ENV_KEYS) {
      const value = environmentValue(source, key, platform);
      if (value !== undefined) environment[key] = value;
    }
  }
  return environment;
}

function pathInside(
  candidate: string,
  root: string,
  pathApi: typeof path.posix | typeof path.win32
): boolean {
  const relative = pathApi.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${pathApi.sep}`) &&
      !pathApi.isAbsolute(relative))
  );
}

export function githubCliCanonicalPathAllowed(
  canonicalCandidate: string,
  canonicalCwd: string,
  canonicalOperatorPath: string | null,
  platform: NodeJS.Platform = process.platform
): boolean {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const normalizeIdentity = (value: string) => {
    const normalized = pathApi.normalize(value);
    return platform === 'win32' ? normalized.toLowerCase() : normalized;
  };
  if (
    canonicalOperatorPath !== null &&
    normalizeIdentity(canonicalCandidate) ===
      normalizeIdentity(canonicalOperatorPath)
  ) {
    return true;
  }
  return !pathInside(canonicalCandidate, canonicalCwd, pathApi);
}

export function githubCliCandidatePaths(
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd()
): string[] {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const executable = platform === 'win32' ? 'gh.exe' : 'gh';
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string | undefined, allowInsideCwd = false) => {
    if (!candidate || !pathApi.isAbsolute(candidate)) return;
    const normalized = pathApi.normalize(candidate);
    if (!allowInsideCwd && pathApi.isAbsolute(cwd) && pathInside(normalized, cwd, pathApi)) {
      return;
    }
    const identity = platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(identity)) return;
    seen.add(identity);
    candidates.push(normalized);
  };

  add(environmentValue(source, 'GH_PATH', platform), true);
  if (platform === 'win32') {
    const programFiles = environmentValue(source, 'ProgramFiles', platform);
    const programFilesX86 = environmentValue(
      source,
      'ProgramFiles(x86)',
      platform
    );
    const localAppData = environmentValue(source, 'LOCALAPPDATA', platform);
    add(
      programFiles
        ? pathApi.join(programFiles, 'GitHub CLI', executable)
        : undefined
    );
    add(
      programFilesX86
        ? pathApi.join(programFilesX86, 'GitHub CLI', executable)
        : undefined
    );
    add(
      localAppData
        ? pathApi.join(localAppData, 'Programs', 'GitHub CLI', executable)
        : undefined
    );
    add(
      localAppData
        ? pathApi.join(localAppData, 'Microsoft', 'WinGet', 'Links', executable)
        : undefined
    );
  } else {
    for (const candidate of [
      '/opt/homebrew/bin/gh',
      '/usr/local/bin/gh',
      '/usr/bin/gh',
      '/snap/bin/gh'
    ]) {
      add(candidate);
    }
  }

  const searchPath = environmentValue(source, 'PATH', platform);
  for (const directory of searchPath?.split(pathApi.delimiter) ?? []) {
    if (!pathApi.isAbsolute(directory) || pathInside(directory, cwd, pathApi)) {
      continue;
    }
    add(pathApi.join(directory, executable));
  }
  return candidates;
}
