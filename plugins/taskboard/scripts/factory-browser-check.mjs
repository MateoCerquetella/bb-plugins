import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

// Attach only to the endpoint returned by this project's Steel binding.
const endpoint = process.env.STEEL_CDP_URL;
if (!endpoint || !process.env.BB_THREAD_STORAGE) throw new Error('Requires Steel CDP and thread storage.');
const plugin = resolve('plugins/taskboard');
const result = await build({
  entryPoints: [resolve(plugin, 'test/factory-preview.tsx')], bundle: true,
  write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  plugins: [{
    name: 'preview-native-hooks',
    setup(build) {
      build.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({
        path: resolve(plugin, 'test/factory-preview-runtime.tsx')
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
const css = await readFile(resolve(plugin, 'app.css'), 'utf8');
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{font:13px system-ui;--border:#ddd;--muted:#f2f3f5;--primary:#286bd4;--muted-foreground:#71757e;--canvas:#fff;--ink:#292b31;--timeline-accent:#286bd4;--success:#19714d;--destructive-text:#b13a4b}
*{box-sizing:border-box}body{margin:0;color:#292b31}main{display:grid;grid-template-columns:minmax(0,1fr) 370px;min-height:100vh}article{padding:28px;border-right:1px solid #ddd}aside{padding:16px;min-width:0}button,textarea{font:inherit;border:1px solid #ddd;border-radius:5px;padding:7px;margin:4px 4px 4px 0}button:disabled{opacity:.5}textarea{width:100%;min-height:140px}button svg{width:14px;height:14px;vertical-align:middle}h1{font-size:16px}pre{font-size:11px}details{margin-top:12px}summary{cursor:pointer}@media(max-width:700px){main{display:block}article{border-bottom:1px solid #ddd;padding:16px}}
${css}</style></head><body><main><article><h1>Native thread</h1><p>Read-only component preview. Agent conversation stays here.</p></article><aside><h1>Taskboard · #42</h1><div id="root"></div></aside></main><script>window.factoryFixture=${JSON.stringify(fixture)}</script><script>${result.outputFiles[0].text.replaceAll('</script>', '<\\/script>')}</script></body></html>`;
try {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.setContent(html);
  await page.getByRole('heading', { name: 'Agent progress' }).waitFor();
  await page.getByRole('button', { name: 'Open session' }).click();
  assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_test']);
  await page.getByText('Implementation plan', { exact: true }).click();
  await page.getByRole('button', { name: 'Save revision' }).click();
  await page.getByRole('button', { name: 'Approve revision 1' }).click();
  assert.equal(await page.evaluate(() => window.factoryFixture.approvedDigest), 'preview-plan');
  await page.getByRole('textbox', { name: 'Implementation plan' }).fill('Revised scope');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await page.getByRole('button', { name: 'Approve revision 2' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start build' }).count(), 0);
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-progress-desktop.png'), fullPage: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width === 390) await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-progress-mobile.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop: 'passed', mobile: 'passed', navigation: 'passed', staleApproval: 'passed', errors }));
} finally { await browser.close(); }
