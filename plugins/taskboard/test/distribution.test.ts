import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const taskboardRoot = fileURLToPath(new URL('../', import.meta.url));

async function taskboardProductSources(directory = taskboardRoot): Promise<string[]> {
  const sources: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      ['dist', 'node_modules', 'scripts', 'test'].includes(entry.name)
    ) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...(await taskboardProductSources(path)));
    } else if (
      entry.isFile() &&
      /\.tsx?$/u.test(entry.name) &&
      relative(taskboardRoot, path) !== 'server.ts'
    ) {
      sources.push(path);
    }
  }
  return sources.sort();
}

const taskboardManifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);
const taskboardContract = await readFile(
  new URL('../contract.ts', import.meta.url),
  'utf8'
);
const taskboardSdkRootValueImports: string[] = [];
for (const path of await taskboardProductSources()) {
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(
    /^\s*import\s+([^;]+?)\s+from\s+['"]@get-bb\/plugin-sdk['"]\s*;/gmu
  )) {
    if (!match[1]?.trimStart().startsWith('type ')) {
      taskboardSdkRootValueImports.push(relative(taskboardRoot, path));
    }
  }
  if (/^\s*import\s*['"]@get-bb\/plugin-sdk['"]\s*;/mu.test(source)) {
    taskboardSdkRootValueImports.push(relative(taskboardRoot, path));
  }
}
const usageManifest = JSON.parse(
  await readFile(
    new URL('../../usage-tracker/package.json', import.meta.url),
    'utf8'
  )
);
const rootManifest = JSON.parse(
  await readFile(new URL('../../../package.json', import.meta.url), 'utf8')
);
const rootLockfile = JSON.parse(
  await readFile(new URL('../../../package-lock.json', import.meta.url), 'utf8')
);
const taskboardReadme = await readFile(
  new URL('../README.md', import.meta.url),
  'utf8'
);
const usageReadme = await readFile(
  new URL('../../usage-tracker/README.md', import.meta.url),
  'utf8'
);
const usageChangelog = await readFile(
  new URL('../../usage-tracker/CHANGELOG.md', import.meta.url),
  'utf8'
);
const rootReadme = await readFile(
  new URL('../../../README.md', import.meta.url),
  'utf8'
);
const rootGitignore = await readFile(
  new URL('../../../.gitignore', import.meta.url),
  'utf8'
);
const ciWorkflow = await readFile(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8'
);
const activeNotices = await Promise.all([
  readFile(new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'),
  readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'),
]);
const activeContext = await Promise.all([
  readFile(
    new URL('../../../.empirical/context/overview.md', import.meta.url),
    'utf8'
  ),
  readFile(
    new URL('../../../.empirical/context/architecture.md', import.meta.url),
    'utf8'
  ),
  readFile(
    new URL('../../../.empirical/context/commands.md', import.meta.url),
    'utf8'
  ),
]);

const directGitInstall =
  'bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.3.3 --subdirectory plugins/taskboard --tag-prefix taskboard/';
const usageGitInstall =
  'bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.3 --subdirectory plugins/usage-tracker --tag-prefix usage-tracker/';

test('keeps Taskboard private and Git-buildable without npm publication hooks', () => {
  assert.equal(rootManifest.private, true);
  for (const script of ['build', 'check', 'test', 'typecheck']) {
    assert.equal(typeof rootManifest.scripts[script], 'string');
  }
  assert.equal(taskboardManifest.name, 'bb-plugin-taskboard');
  assert.equal(taskboardManifest.version, '0.3.3');
  assert.equal(taskboardManifest.private, true);
  assert.equal('publishConfig' in taskboardManifest, false);
  assert.equal('files' in taskboardManifest, false);
  assert.equal('prepack' in taskboardManifest.scripts, false);
  assert.equal(taskboardManifest.bb.server, './server.ts');
  assert.equal(taskboardManifest.bb.app, './app.tsx');
  for (const script of ['build', 'dev', 'typecheck', 'test', 'check']) {
    assert.equal(typeof taskboardManifest.scripts[script], 'string');
  }
  assert.ok(Object.keys(taskboardManifest.dependencies).length > 0);
  assert.equal(
    Object.hasOwn(taskboardManifest.dependencies, '@get-bb/plugin-sdk'),
    false
  );
  assert.equal(
    taskboardManifest.devDependencies['@get-bb/plugin-sdk'],
    '0.4.6'
  );

  const taskboardLockManifest = rootLockfile.packages['plugins/taskboard'];
  assert.equal(taskboardLockManifest.version, '0.3.3');
  assert.equal(
    Object.hasOwn(taskboardLockManifest.dependencies, '@get-bb/plugin-sdk'),
    false
  );
  assert.equal(
    taskboardLockManifest.devDependencies['@get-bb/plugin-sdk'],
    '0.4.6'
  );
  const sdkLockPackage = rootLockfile.packages['node_modules/@get-bb/plugin-sdk'];
  assert.equal(sdkLockPackage.version, '0.4.6');
  assert.equal(sdkLockPackage.dev, true);

  const sdkRootImports = Array.from(
    taskboardContract.matchAll(
      /\bimport\s+([^;]+?)\s+from\s+['"]@get-bb\/plugin-sdk['"]\s*;/gu
    ),
    match => match[1].replace(/\s+/gu, ' ').trim()
  );
  assert.deepEqual(sdkRootImports, ['type { PluginRpcContract }']);
  assert.doesNotMatch(
    taskboardContract,
    /\bimport\s*['"]@get-bb\/plugin-sdk['"]\s*;/u
  );
  assert.doesNotMatch(taskboardContract, /\bdefineRpcContract\b/u);
  assert.deepEqual(taskboardSdkRootValueImports, []);
});

test('documents only BB Community and direct Git installation for Taskboard', () => {
  for (const document of [
    rootReadme,
    taskboardReadme,
    usageReadme,
    usageChangelog,
    ...activeContext,
    ...activeNotices,
  ]) {
    assert.doesNotMatch(document, /npm:bb-plugin-taskboard/u);
    assert.doesNotMatch(
      document,
      /(?:npmjs\.com\/package|shields\.io\/npm\/v)\/bb-plugin-taskboard/u
    );
    assert.doesNotMatch(document, /npm remains.*distribution/iu);
  }
  for (const readme of [rootReadme, taskboardReadme]) {
    assert.match(readme, /bb plugin install taskboard/u);
    assert.ok(readme.includes(directGitInstall));
    assert.match(readme, /After \[the BB Community entry\]/u);
  }
  assert.match(rootReadme, /npm install/u);
  assert.match(rootReadme, /npm run check/u);
});

test('keeps Usage Tracker private and documents its Git release too', async () => {
  assert.equal(usageManifest.private, true);
  assert.equal(usageManifest.name, 'bb-plugin-usage-tracker');
  assert.equal(usageManifest.version, '0.1.3');
  assert.equal('publishConfig' in usageManifest, false);
  assert.equal('files' in usageManifest, false);
  assert.equal('prepack' in usageManifest.scripts, false);
  for (const document of [
    rootReadme,
    taskboardReadme,
    usageReadme,
    usageChangelog,
    ...activeContext,
    ...activeNotices,
  ]) {
    assert.doesNotMatch(document, /npm:bb-plugin-usage-tracker/u);
    assert.doesNotMatch(
      document,
      /(?:npmjs\.com\/package|shields\.io\/npm\/v)\/bb-plugin-usage-tracker/u
    );
  }
  for (const readme of [rootReadme, usageReadme]) {
    assert.match(readme, /bb plugin install usage-tracker/u);
    assert.ok(readme.includes(usageGitInstall));
  }
  await assert.rejects(
    readFile(new URL('../../../.npmrc.publish', import.meta.url), 'utf8'),
    /ENOENT/u
  );
  assert.match(rootGitignore, /^\.npm-publish\.env$/mu);
});

test('has no active registry publication automation or credential path', () => {
  assert.doesNotMatch(
    ciWorkflow,
    /(?:npm\s+(?:publish|unpublish)|NPM_TOKEN|NODE_AUTH_TOKEN|registry\.npmjs\.org)/iu
  );
  assert.match(ciWorkflow, /permissions:\s*\n\s*contents:\s*read/u);
  for (const manifest of [rootManifest, taskboardManifest, usageManifest]) {
    assert.equal(manifest.private, true);
    for (const field of ['publishConfig', 'files']) {
      assert.equal(field in manifest, false);
    }
    for (const hook of [
      'prepublish',
      'prepublishOnly',
      'publish',
      'postpublish',
      'prepack',
      'postpack',
    ]) {
      assert.equal(hook in manifest.scripts, false);
    }
    for (const script of Object.values(manifest.scripts)) {
      assert.doesNotMatch(String(script), /npm\s+(?:publish|unpublish)/iu);
    }
  }
});

test('credits merged contributors without reviving superseded filter storage', async () => {
  assert.match(
    rootReadme,
    /https:\/\/github\.com\/stephendolan/u
  );
  assert.match(rootReadme, /https:\/\/github\.com\/RIP21/u);
  assert.match(taskboardReadme, /named filter presets/u);
  assert.match(usageReadme, /configurable Compact limit/u);

  for (const path of ['filter-state.ts', 'work-schemas.ts']) {
    await assert.rejects(
      readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
      /ENOENT/u
    );
  }

  const activeTaskboardSource = await Promise.all([
    readFile(new URL('../app.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../contract.ts', import.meta.url), 'utf8'),
    readFile(new URL('../server.ts', import.meta.url), 'utf8'),
    readFile(new URL('../store.ts', import.meta.url), 'utf8'),
  ]);
  for (const source of activeTaskboardSource) {
    assert.doesNotMatch(
      source,
      /project_filter_state|getBoardFilterState|saveBoardFilterState/u
    );
  }
});
