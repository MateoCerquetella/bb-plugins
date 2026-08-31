import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const taskboardRootUrl = new URL('../', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.startsWith(taskboardRootUrl) &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      specifier.endsWith('.js')
    ) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    return nextResolve(specifier, context);
  }
});

const { githubCliEnvironment, githubCliSearchCandidates } = await import(
  '../sources/github.ts'
);

test('builds the exact GitHub CLI environment without executable search state', () => {
  const source: NodeJS.ProcessEnv = {
    GH_TOKEN: 'gh-token',
    GITHUB_TOKEN: 'github-token',
    GH_ENTERPRISE_TOKEN: 'gh-enterprise-token',
    GITHUB_ENTERPRISE_TOKEN: 'github-enterprise-token',
    GH_HOST: 'github.example.com',
    GH_CONFIG_DIR: '/config/gh',
    XDG_CONFIG_HOME: '/config',
    HOME: '/home/tester',
    APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
    USERPROFILE: 'C:\\Users\\tester',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    HTTP_PROXY: 'http://uppercase-http-proxy',
    HTTPS_PROXY: 'http://uppercase-https-proxy',
    NO_PROXY: 'github.example.com',
    http_proxy: 'http://lowercase-http-proxy',
    https_proxy: 'http://lowercase-https-proxy',
    no_proxy: 'localhost',
    SSL_CERT_FILE: '/certs/ca.pem',
    SSL_CERT_DIR: '/certs',
    PATH: '/usr/local/bin:/usr/bin',
    GH_PROMPT_DISABLED: '0',
    GH_NO_UPDATE_NOTIFIER: '0',
    GH_TELEMETRY: '1',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8'
  };

  assert.deepEqual(githubCliEnvironment(source, 'linux'), {
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GH_TELEMETRY: '0',
    LANG: 'C',
    LC_ALL: 'C',
    GH_TOKEN: 'gh-token',
    GITHUB_TOKEN: 'github-token',
    GH_ENTERPRISE_TOKEN: 'gh-enterprise-token',
    GITHUB_ENTERPRISE_TOKEN: 'github-enterprise-token',
    GH_HOST: 'github.example.com',
    GH_CONFIG_DIR: '/config/gh',
    XDG_CONFIG_HOME: '/config',
    HOME: '/home/tester',
    APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
    USERPROFILE: 'C:\\Users\\tester',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    HTTP_PROXY: 'http://uppercase-http-proxy',
    HTTPS_PROXY: 'http://uppercase-https-proxy',
    NO_PROXY: 'github.example.com',
    http_proxy: 'http://lowercase-http-proxy',
    https_proxy: 'http://lowercase-https-proxy',
    no_proxy: 'localhost',
    SSL_CERT_FILE: '/certs/ca.pem',
    SSL_CERT_DIR: '/certs'
  });
});

test('never forwards PATH or PATHEXT into the authenticated child', () => {
  const source: NodeJS.ProcessEnv = {
    PATH: '/untrusted/bin',
    PATHEXT: '.EXE;.CMD',
    SYSTEMROOT: 'C:\\Windows',
    HOME: '/home/tester'
  };

  assert.deepEqual(githubCliEnvironment(source, 'linux'), {
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GH_TELEMETRY: '0',
    LANG: 'C',
    LC_ALL: 'C',
    HOME: '/home/tester'
  });
  assert.deepEqual(
    githubCliEnvironment(source, 'win32'),
    {
      GH_PROMPT_DISABLED: '1',
      GH_NO_UPDATE_NOTIFIER: '1',
      GH_TELEMETRY: '0',
      LANG: 'C',
      LC_ALL: 'C',
      HOME: '/home/tester',
      SYSTEMROOT: 'C:\\Windows'
    }
  );
});

test('ignores PATH and resolves only fixed non-project POSIX candidates', () => {
  assert.deepEqual(
    githubCliSearchCandidates(
      {
        PATH: ':/workspace/bin:relative:/custom/bin:/usr/bin'
      },
      'linux',
      ['/workspace']
    ),
    [
      '/opt/homebrew/bin/gh',
      '/usr/local/bin/gh',
      '/usr/bin/gh'
    ]
  );
});

test('uses fixed Windows install roots and excludes PATH/project candidates', () => {
  assert.deepEqual(
    githubCliSearchCandidates(
      {
        PROGRAMFILES: 'C:\\Program Files',
        LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
        PATH:
          ';relative;C:\\workspace\\bin;C:\\Tools;C:\\Program Files\\GitHub CLI'
      },
      'win32',
      ['C:\\workspace']
    ),
    [
      'C:\\Program Files\\GitHub CLI\\gh.exe',
      'C:\\Users\\tester\\AppData\\Local\\Programs\\GitHub CLI\\gh.exe'
    ]
  );
});

test('excludes unrelated credentials, runtime hooks, and CLI controls', () => {
  const source: NodeJS.ProcessEnv = {
    GH_TOKEN: 'allowed-token',
    ALL_PROXY: 'socks5://proxy',
    all_proxy: 'socks5://proxy',
    REQUEST_METHOD: 'POST',
    NODE_OPTIONS: '--require ./inject.cjs',
    NODE_PATH: '/injected/modules',
    LD_PRELOAD: '/tmp/inject.so',
    DYLD_INSERT_LIBRARIES: '/tmp/inject.dylib',
    AWS_SECRET_ACCESS_KEY: 'unrelated-secret',
    GH_DEBUG: 'api',
    GH_PAGER: 'less',
    PAGER: 'less',
    EDITOR: 'vim',
    VISUAL: 'vim',
    CI: 'true'
  };

  assert.deepEqual(
    githubCliEnvironment(source, 'linux'),
    {
      GH_PROMPT_DISABLED: '1',
      GH_NO_UPDATE_NOTIFIER: '1',
      GH_TELEMETRY: '0',
      LANG: 'C',
      LC_ALL: 'C',
      GH_TOKEN: 'allowed-token'
    }
  );
});
