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
        contents: `${await readFile(path, 'utf8')}\nexport { KanbanCard, TrackerDetail, CreateIssueDialog };`,
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
    updates: [{ id: 'message', text: 'Found the project-switch race. Checking saved preferences.', at: new Date().toISOString() }],
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
  await page.route('https://taskboard-preview.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://taskboard-preview.test/');
  const manual = page.locator('#preview-manual');
  await manual.getByRole('heading', { name: 'Agent', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Task progress:/ }).click();
  await page.getByRole('dialog').locator('summary').filter({ hasText: 'Agent updates' }).waitFor();
  assert.equal(await page.getByRole('dialog').locator('.tb-command-group').getAttribute('open'), null);
  await page.getByRole('dialog').locator('.tb-command-group > summary').click();
  await page.getByRole('dialog').getByText('npm test', { exact: true }).waitFor();
  await page.getByRole('dialog').locator('.tb-command-group > summary').click();
  await page.getByRole('dialog').locator('summary').filter({ hasText: 'Changed files' }).click();
  await page.getByRole('dialog').locator('[data-native-diff-preview]').waitFor();
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-diff-preview.png') });
  assert.match(await page.getByRole('dialog').locator('[data-native-diff-preview]').innerText(), /\+const saved/);
  await page.getByRole('dialog').getByRole('button', { name: 'Refresh diff' }).click();
  await page.getByRole('dialog').locator('[data-native-diff-preview]').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.getByRole('dialog').locator('.tb-live-mark').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('dialog').getByRole('button', { name: 'Original ticket', exact: true }).click();
  assert.equal(await page.evaluate(() => window.factoryNavigation.pop()), 'item/proj_test/github/example~2Frepo~2342');
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-thread-progress.png') });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-progress-dialog-${width}.png`) });
  }
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.cssText = '--canvas:#202124;--ink:#ececf0;--muted-foreground:#a2a4ae;--border:#393b42;--timeline-accent:#7ba8fa;--success:#69c69b;--warning:#e1b563;--destructive-text:#f18694;--surface-recessed-soft-solid:#292a2f';
  });
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-progress-dark.png') });
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.cssText = '';
  });
  await page.keyboard.press('Escape');
  await manual.getByRole('button', { name: 'Open session' }).first().click();
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
  assert.equal(await page.evaluate(() => localStorage.getItem('bb-taskboard:right-panel-pinned')), null);
  assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_test', 'thr_started']);
  await manual.locator('.tb-run[data-live="true"] .tb-live-mark').waitFor();
  assert.equal(await manual.locator('.tb-live-mark').evaluate(el => getComputedStyle(el).animationName), 'tb-working');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await manual.locator('.tb-live-mark').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
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
  await page.evaluate(() => {
    const record = window.factoryFixture;
    record.stage = 'Review'; record.automatic = false; record.version++;
    record.approvedDigest = record.plans.at(-1).digest;
    record.runs = [{ ...record.runs[0], id: 'review-blocked', kind: 'review', status: 'finished',
      output: 'The requested implementation is missing. Verify the Build worktree.',
      reviewResult: { verdict: 'blocked', findings: 'The requested implementation is missing.' },
      repairOf: null, planDigest: record.approvedDigest, activity: 'Review found blockers' }];
    window.factoryRefresh();
  });
  await manual.getByRole('status').getByText('Review found blockers', { exact: true }).waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await manual.getByRole('button', { name: 'Return to Build with findings', exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-review-blocked-${width}.png`), fullPage: true });
  }
  await manual.getByRole('button', { name: 'Return to Build with findings', exact: true }).click();
  await manual.getByText('Addressing review findings in the Build workspace. Review will run again automatically.').waitFor();
  assert.equal(await page.evaluate(() => window.factoryNavigation.at(-1)), 'thr_build');
  await page.evaluate(() => {
    const record = window.factoryFixture;
    const review = record.runs[0];
    const repair = record.runs[1];
    record.runs = [review, { ...repair, status: 'finished', id: 'repair-1' },
      { ...repair, status: 'finished', id: 'repair-2' }, { ...review, id: 'review-still-blocked' }];
    record.stage = 'Review'; record.version++;
    record.automationError = 'Automatic work paused: Review repair limit reached (2 attempts). Inspect the findings and revise the plan before continuing.';
    window.factoryRefresh();
  });
  await manual.getByText('Review still found blockers after two repair attempts. Inspect the findings and revise the plan.').waitFor();
  assert.equal(await manual.getByRole('button', { name: 'Return to Build with findings', exact: true }).isDisabled(), true);
  if (!await manual.getByRole('textbox', { name: 'Implementation plan' }).isVisible()) {
    await manual.getByText('Implementation plan', { exact: true }).click();
  }
  await manual.getByRole('textbox', { name: 'Implementation plan' }).waitFor();
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-review-repair-limit.png'), fullPage: true });
  for (const start of [false, true]) {
    await page.goto(`https://taskboard-preview.test/?creation=${start}`);
    await page.getByLabel('Title', { exact: true }).fill('Fix screenshot layout');
    await page.getByLabel('Description', { exact: true }).fill('Match the attached screenshot.');
    await page.getByRole('button', { name: 'Create only', exact: true }).waitFor();
    await page.locator('form').evaluate(form => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
      form.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
    await page.getByRole('img', { name: 'pasted.png' }).waitFor();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-create-images-${width}.png`) });
    }
    if (start) await page.getByRole('button', { name: 'Remove image 1' }).click();
    await page.getByRole('button', { name: start ? 'Start now' : 'Create only', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.createdInputs.length), 1);
    assert.equal(await page.evaluate(() => window.factoryStarts), start ? 1 : 0);
    assert.equal(await page.evaluate(() => window.createdInputs[0].images.length), start ? 0 : 1);
    if (!start) assert.equal(await page.evaluate(() => window.factoryNavigation.at(-1)), 'item/proj_test/linear/issue-42');
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop: 'passed', panel: 'passed', mobile: 'passed', kanbanStart: 'passed', liveStatus: 'passed', navigation: 'passed', staleApproval: 'passed', automaticActions: 'passed', reviewBlockers: 'passed', returnToBuild: 'passed', repairLimit: 'passed', errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, page: await page.locator('body').innerText() }));
  throw error;
} finally { await browser.close(); }
