import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildGithubCliDiscoveryEnvironment,
  buildGithubCliEnvironment,
  githubCliCanonicalPathAllowed,
  githubCliCandidatePaths
} from '../sources/github-environment.ts';

const githubSource = await readFile(
  new URL('../sources/github.ts', import.meta.url),
  'utf8'
);

test('passes only deliberate GitHub CLI environment categories on POSIX', () => {
  const source = {
    PATH: '/bin',
    HOME: '/home/test',
    XDG_CONFIG_HOME: '/home/test/.config',
    XDG_RUNTIME_DIR: '/run/user/1000',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    GH_CONFIG_DIR: '/home/test/.config/gh',
    GH_PATH: '/opt/operator/gh',
    GH_TOKEN: 'gh-token',
    GITHUB_TOKEN: '',
    GH_ENTERPRISE_TOKEN: 'enterprise-token',
    GITHUB_ENTERPRISE_TOKEN: 'github-enterprise-token',
    GH_HOST: 'github.example.com',
    HTTP_PROXY: 'http://proxy.example',
    http_proxy: 'http://lower-proxy.example',
    HTTPS_PROXY: 'https://proxy.example',
    https_proxy: 'https://lower-proxy.example',
    NO_PROXY: 'localhost',
    no_proxy: '127.0.0.1',
    SSL_CERT_FILE: '/etc/ssl/cert.pem',
    SSL_CERT_DIR: '/etc/ssl/certs',
    TMPDIR: '/tmp/taskboard',
    TMP: '/tmp',
    TEMP: '/var/tmp',
    BB_TOKEN: 'bb-secret',
    LINEAR_API_KEY: 'linear-secret',
    JIRA_API_TOKEN: 'jira-secret',
    OPENAI_API_KEY: 'openai-secret',
    AWS_SECRET_ACCESS_KEY: 'aws-secret',
    NODE_OPTIONS: '--require attacker.js',
    npm_config_userconfig: '/secret/npmrc'
  } satisfies NodeJS.ProcessEnv;

  const environment = buildGithubCliEnvironment(source, 'linux');

  assert.deepEqual(environment, {
    LANG: 'C',
    LC_ALL: 'C',
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    PATH: '/bin',
    GH_TOKEN: 'gh-token',
    GITHUB_TOKEN: '',
    GH_ENTERPRISE_TOKEN: 'enterprise-token',
    GITHUB_ENTERPRISE_TOKEN: 'github-enterprise-token',
    GH_HOST: 'github.example.com',
    GH_CONFIG_DIR: '/home/test/.config/gh',
    HOME: '/home/test',
    XDG_CONFIG_HOME: '/home/test/.config',
    HTTP_PROXY: 'http://proxy.example',
    http_proxy: 'http://lower-proxy.example',
    HTTPS_PROXY: 'https://proxy.example',
    https_proxy: 'https://lower-proxy.example',
    NO_PROXY: 'localhost',
    no_proxy: '127.0.0.1',
    SSL_CERT_FILE: '/etc/ssl/cert.pem',
    SSL_CERT_DIR: '/etc/ssl/certs',
    TMPDIR: '/tmp/taskboard',
    TMP: '/tmp',
    TEMP: '/var/tmp',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    XDG_RUNTIME_DIR: '/run/user/1000'
  });
  assert.equal(Object.hasOwn(environment, 'GH_PATH'), false);
  assert.equal(source.NODE_OPTIONS, '--require attacker.js');
});

test('normalizes deliberate Windows keys case-insensitively', () => {
  const environment = buildGithubCliEnvironment(
    {
      Path: 'C:\\Windows\\System32',
      gh_token: 'token',
      appData: 'C:\\Users\\test\\AppData\\Roaming',
      localappdata: 'C:\\Users\\test\\AppData\\Local',
      systemroot: 'C:\\Windows',
      temp: 'C:\\Temp'
    },
    'win32'
  );

  assert.equal(environment.PATH, 'C:\\Windows\\System32');
  assert.equal(environment.GH_TOKEN, 'token');
  assert.equal(environment.APPDATA, 'C:\\Users\\test\\AppData\\Roaming');
  assert.equal(environment.LOCALAPPDATA, 'C:\\Users\\test\\AppData\\Local');
  assert.equal(environment.SystemRoot, 'C:\\Windows');
  assert.equal(environment.TEMP, 'C:\\Temp');
  assert.equal(Object.keys(environment).filter(key => key === 'PATH').length, 1);
});

test('keeps POSIX environment matching case-sensitive', () => {
  const environment = buildGithubCliEnvironment(
    { Path: '/wrong', gh_token: 'wrong', PATH: '/right' },
    'linux'
  );

  assert.equal(environment.PATH, '/right');
  assert.equal(environment.GH_TOKEN, undefined);
  assert.equal(environment.Path, undefined);
  assert.equal(environment.gh_token, undefined);
});

test('probes GitHub CLI without credentials or executable search state', () => {
  const environment = buildGithubCliDiscoveryEnvironment(
    {
      PATH: '/repo/bin:/usr/bin',
      HOME: '/home/test',
      GH_TOKEN: 'secret',
      GITHUB_TOKEN: 'secret-2',
      GH_CONFIG_DIR: '/home/test/.config/gh',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp'
    },
    'win32'
  );

  assert.deepEqual(environment, {
    LANG: 'C',
    LC_ALL: 'C',
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    SystemRoot: 'C:\\Windows',
    TEMP: 'C:\\Temp'
  });
});

test('rejects relative and current-workspace POSIX search entries', () => {
  const candidates = githubCliCandidatePaths(
    {
      GH_PATH: '/opt/operator/gh',
      PATH: '.:relative:/workspace/project/bin:/opt/tools:/usr/bin'
    },
    'linux',
    '/workspace/project'
  );

  assert.equal(candidates[0], '/opt/operator/gh');
  assert.ok(candidates.includes('/opt/tools/gh'));
  assert.ok(candidates.includes('/usr/bin/gh'));
  assert.equal(candidates.some(candidate => candidate.includes('relative')), false);
  assert.equal(
    candidates.some(candidate => candidate.startsWith('/workspace/project/')),
    false
  );
  assert.ok(candidates.every(candidate => candidate.startsWith('/')));
});

test('rejects current-directory Windows gh.exe shadowing', () => {
  const candidates = githubCliCandidatePaths(
    {
      PATH: '.;relative;C:\\repo;C:\\repo\\bin;C:\\tools',
      ProgramFiles: 'C:\\Program Files',
      LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local'
    },
    'win32',
    'C:\\repo'
  );

  assert.ok(candidates.includes('C:\\Program Files\\GitHub CLI\\gh.exe'));
  assert.ok(candidates.includes('C:\\tools\\gh.exe'));
  assert.equal(
    candidates.some(candidate => candidate.toLowerCase().startsWith('c:\\repo')),
    false
  );
  assert.equal(candidates.some(candidate => candidate.startsWith('.')), false);
});

test('resolves and probes only absolute GitHub CLI candidates', () => {
  assert.match(githubSource, /for \(const candidate of githubCliCandidatePaths\(\)\)/u);
  assert.match(githubSource, /const absoluteCandidate = await realpath\(candidate\)/u);
  assert.match(githubSource, /githubCliCanonicalPathAllowed\(/u);
  assert.match(githubSource, /buildGithubCliDiscoveryEnvironment\(\)/u);
  assert.doesNotMatch(githubSource, /for \(const candidate of \[\s*'gh'/u);
});

test('rejects an external symlink that canonicalizes into the workspace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'taskboard-gh-shadow-'));
  try {
    const workspace = join(root, 'workspace');
    const external = join(root, 'external');
    const workspaceGh = join(workspace, 'gh');
    const shadowGh = join(external, 'gh');
    await mkdir(workspace, { recursive: true });
    await mkdir(external, { recursive: true });
    await writeFile(workspaceGh, '#!/bin/sh\nexit 0\n');
    try {
      await symlink(workspaceGh, shadowGh);
    } catch (error) {
      if (
        process.platform === 'win32' &&
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES')
      ) {
        t.skip('Windows symlink creation is unavailable on this host');
        return;
      }
      throw error;
    }

    const canonicalWorkspace = await realpath(workspace);
    const canonicalShadow = await realpath(shadowGh);
    assert.equal(
      githubCliCanonicalPathAllowed(
        canonicalShadow,
        canonicalWorkspace,
        null,
        process.platform
      ),
      false
    );
    assert.equal(
      githubCliCanonicalPathAllowed(
        canonicalShadow,
        canonicalWorkspace,
        canonicalShadow,
        process.platform
      ),
      true
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
