import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

// Attach only to the endpoint returned by this project's Steel binding.
const endpoint = process.env.STEEL_CDP_URL;
if (!endpoint || !process.env.BB_THREAD_STORAGE) throw new Error('Requires Steel CDP and thread storage.');
const plugin = resolve('plugins/taskboard');
const result = await build({
  entryPoints: [resolve(plugin, 'test/factory-preview.tsx')], bundle: true,
  write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{
    name: 'preview-native-hooks',
    setup(build) {
      build.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({
        path: resolve(plugin, 'test/factory-preview-runtime.tsx')
      }));
      build.onLoad({ filter: /\/taskboard\/app\.tsx$/ }, async ({ path }) => ({
        contents: `${await readFile(path, 'utf8')}\nexport { KanbanCard, TrackerDetail };`,
        loader: 'tsx'
      }));
    }
  }]
});
const metadata = await fetch(endpoint + '/json/version').then(r => r.json());
const ws = new URL(metadata.webSocketDebuggerUrl);
ws.host = new URL(endpoint).host;
const browser = await chromium.connectOverCDP(ws.href);
const context = browser.contexts()[0];
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const fixture = {
  schemaVersion: 1, projectId: 'proj_test', source: 'github', locator: 'example/repo#42',
  version: 3, scopeDigest: 'scope', approvedDigest: null, plans: [],
  automatic: false, automationError: null, trackerProgress: { status: 'pending', message: null },
  stage: 'Planning', updatedAt: new Date().toISOString(),
  runs: [{
    id: 'run', kind: 'plan', status: 'finished', threadId: 'thr_test', environmentId: 'env_managed_worktree',
    cursor: 9, turnId: 'turn', planDigest: null, activity: 'Turn finished; work not accepted',
    error: null, output: 'Preserve filters per project. Add a regression test for switching between two projects.',
    checks: [{ id: 'check', command: 'npm test', exitCode: 1, output: 'Regression failed: project preferences were reset.' }],
    steps: [{ step: 'Inspect project selection', status: 'completed' }],
    changedFiles: ['plugins/taskboard/browse-preferences.ts'],
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString()
  }]
};
const css = await readFile(resolve(plugin, 'dist/app.css'), 'utf8');
// Plugin utilities come from the pinned BB host, rather than dist/app.css.
const hostAssets = resolve('node_modules/bb-app/app/dist/assets');
const hostStylesheet = (await readdir(hostAssets)).find(name => /^index-.*\.css$/.test(name));
if (!hostStylesheet) throw new Error('Pinned BB stylesheet not found.');
const hostCss = await readFile(resolve(hostAssets, hostStylesheet), 'utf8');
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
${hostCss}
:root{font:16px system-ui;--border:#ddd;--muted:#f2f3f5;--primary:#286bd4;--muted-foreground:#71757e;--canvas:#fff;--ink:#292b31;--timeline-accent:#286bd4;--success:#19714d;--destructive-text:#b13a4b}
*{box-sizing:border-box}body{margin:0;color:#292b31;font-size:13px}#preview-detail{width:100%;min-width:0}#preview-manual{padding:20px}pre{font-size:11px}
${css}</style></head><body><div id="root"></div><script>window.factoryFixture=${JSON.stringify(fixture)}</script><script>${result.outputFiles[0].text.replaceAll('</script>', '<\\/script>')}</script></body></html>`;
try {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.setContent(html);
  const manual = page.locator('#preview-manual');
  await manual.getByRole('heading', { name: 'Agent', exact: true }).waitFor();
  await manual.getByRole('button', { name: 'Open session' }).click();
  assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_test']);
  await manual.getByText('Implementation plan', { exact: true }).click();
  await manual.getByRole('button', { name: 'Save revision' }).click();
  await manual.getByRole('button', { name: 'Approve revision 1' }).click();
  assert.equal(await page.evaluate(() => window.factoryFixture.approvedDigest), 'preview-plan');
  await manual.getByRole('textbox', { name: 'Implementation plan' }).fill('Revised scope');
  await manual.getByRole('button', { name: 'Save revision' }).click();
  await manual.getByRole('button', { name: 'Approve revision 2' }).waitFor();
  assert.equal(await manual.getByRole('button', { name: 'Start build' }).count(), 0);
  await page.locator('#preview-card').getByRole('button', { name: 'Start task', exact: true }).click();
  assert.equal(await page.evaluate(() => window.factoryStarts), 1);
  assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_test', 'thr_started']);
  await page.locator('#preview-detail .tb-detail-meta').getByText('In progress', { exact: true }).waitFor({ state: 'attached' });
  for (const width of [1280, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = width >= 960;
    assert.equal(await page.locator('#preview-detail .tb-detail-aside').isVisible(), wide);
    assert.equal(await page.locator('#preview-detail .tb-detail-meta').isVisible(), !wide);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const name = width === 1280 ? 'desktop' : width === 800 ? 'panel' : 'mobile';
    await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-progress-${name}.png`), fullPage: true });
  }
  assert.equal(await page.getByRole('button', { name: /Generate plan|Start build|Approve revision/ }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop: 'passed', panel: 'passed', mobile: 'passed', kanbanStart: 'passed', liveStatus: 'passed', navigation: 'passed', staleApproval: 'passed', automaticActions: 'passed', errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, page: await page.locator('body').innerText() }));
  throw error;
} finally { await browser.close(); }
