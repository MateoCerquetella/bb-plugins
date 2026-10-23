import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
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
const fixture = {
  schemaVersion: 1, projectId: 'proj_test', source: 'github', locator: 'example/repo#42',
  version: 3, scopeDigest: 'scope', approvedDigest: null, plans: [],
  admission: { kind: 'manual' },
  coordinator: { status: 'ready', intentId: 'preview-intent', startedAt: new Date().toISOString(),
    legacyRunCount: 0, threadId: 'thr_coordinator', nativeStatus: 'idle', error: null },
  automatic: false, automationError: null, trackerProgress: { status: 'pending', message: null },
  stage: 'Planning', updatedAt: new Date().toISOString(),
  runs: [{
    id: 'run', kind: 'plan', status: 'finished', threadId: 'thr_test', environmentId: 'env_managed_worktree',
    hostId: 'host_demo', checkoutRoot: '/demo/empirical',
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
*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--canvas);font-size:13px}#preview-detail{width:100%;min-width:0}#preview-manual{padding:20px}pre{font-size:11px}
${css}</style></head><body><div id="root" data-bb-plugin="taskboard"></div><script>window.factoryFixture=${JSON.stringify(fixture)};window.empiricalOffline=false;window.empiricalLastKnown=null;window.empiricalStatus={kind:'feature',feature:'demo-live-work',revision:1,phase:'implement',status:'waiting',nextAction:'Implement the current acceptance criteria',verification:'pending',completionLevel:'none',completionMethod:null};</script><script>${result.outputFiles[0].text.replaceAll('</script>', '<\\/script>')}</script></body></html>`;
if (process.env.TASKBOARD_DEMO_PORT) {
  const port = Number(process.env.TASKBOARD_DEMO_PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid demo port.');
  createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
  }).listen(port, '0.0.0.0', () => console.log(`Taskboard demo listening on ${port}`));
} else {
// Attach only to the endpoint returned by this project's Steel binding.
const endpoint = process.env.STEEL_CDP_URL;
if (!endpoint || !process.env.BB_THREAD_STORAGE) throw new Error('Requires Steel CDP and thread storage.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const metadata = await fetch(endpoint + '/json/version').then(r => r.json());
const ws = new URL(metadata.webSocketDebuggerUrl);
ws.host = new URL(endpoint).host;
const browser = await chromium.connectOverCDP(ws.href);
const context = browser.contexts()[0];
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.route('https://taskboard-preview.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://taskboard-preview.test/');
  if (process.env.TASKBOARD_START_TASK_ONLY) {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#preview-card').getByRole('button', { name: 'Start task', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Start task' });
      await dialog.getByRole('button', { name: 'Start task', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[role="dialog"] [role="status"]'));
      assert.equal(await dialog.getByRole('combobox', { name: 'AI provider' }).inputValue(), 'claude:claude-sonnet');
      assert.equal(await page.evaluate(() => window.factoryStarts), 0);
      await dialog.getByRole('combobox', { name: 'AI provider' }).selectOption('codex:gpt-5');
      assert.equal(await page.evaluate(() => window.factoryStarts), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-start-task-${width}.png`) });
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await page.evaluate(() => window.factoryStarts), 0);
    }
    await page.locator('#preview-card').getByRole('button', { name: 'Start task', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Start task' });
    await dialog.getByRole('combobox', { name: 'AI provider' }).selectOption('codex:gpt-5');
    await dialog.getByRole('button', { name: 'Start task', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.factoryStarts), 1);
    assert.deepEqual(await page.evaluate(() => window.factoryStartExecution), {
      providerId: 'codex', model: 'gpt-5', permissionMode: 'auto',
      reasoningLevel: 'medium', serviceTier: 'default'
    });
    assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_coordinator']);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ startTaskConfirmation: 'passed', selectedModel: 'passed', cancel: 'passed', navigation: 'passed', desktop: 'passed', mobile: 'passed', errors }));
  } else {
  const factorySettings = page.locator('#preview-factory-settings');
  await factorySettings.getByRole('checkbox', { name: 'Enable automatic intake' }).check();
  await factorySettings.getByRole('spinbutton', { name: 'Automatic concurrency' }).fill('2');
  await factorySettings.getByRole('combobox', { name: 'AI provider' }).selectOption('claude:claude-sonnet');
  await factorySettings.getByRole('button', { name: /^Save (settings|changes)$/ }).click();
  await factorySettings.getByText('Running', { exact: true }).waitFor();
  await factorySettings.getByText('Applies to new coordinator and stage sessions. Existing sessions keep their original model.').waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-factory-settings-${width}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await factorySettings.getByRole('checkbox', { name: 'Enable automatic intake' }).uncheck();
  await factorySettings.getByRole('button', { name: /^Save (settings|changes)$/ }).click();
  await factorySettings.getByText('Disabled', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 1000 });
  const manual = page.locator('#preview-manual');
  await manual.locator('.tb-factory-summary').waitFor();
  await page.getByRole('button', { name: /^Task progress:/ }).click();
  await page.getByRole('dialog').locator('summary').filter({ hasText: 'Agent updates' }).waitFor();
  assert.equal(await page.getByRole('dialog').locator('.tb-command-group').getAttribute('open'), null);
  await page.getByRole('dialog').locator('.tb-command-group > summary').click();
  await page.getByRole('dialog').getByText('npm test', { exact: true }).waitFor();
  await page.getByRole('dialog').locator('.tb-command-group > summary').click();
  await page.getByRole('dialog').getByRole('tab', { name: /Changes/ }).click();
  await page.getByRole('dialog').locator('summary').filter({ hasText: 'Changed files' }).click();
  await page.getByRole('dialog').locator('[data-native-diff-preview]').waitFor();
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-diff-preview.png') });
  assert.match(await page.getByRole('dialog').locator('[data-native-diff-preview]').innerText(), /\+const saved/);
  await page.getByRole('dialog').getByRole('button', { name: 'Refresh diff' }).click();
  await page.getByRole('dialog').locator('[data-native-diff-preview]').waitFor();
  await page.getByRole('dialog').getByRole('tab', { name: 'Activity', exact: true }).click();
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
  await page.evaluate(() => {
    const record = window.factoryFixture;
    record.runs.unshift({ ...record.runs[0], id: 'investigate-run', kind: 'investigate',
      threadId: 'thr_investigate', output: 'Bounded investigation findings.' });
    record.version++; window.factoryRefresh();
  });
  const sessionSelect = manual.locator('.tb-session-picker select');
  assert.equal(await sessionSelect.inputValue(), 'run');
  await page.evaluate(() => {
    const record = window.factoryFixture;
    record.runs.push({ ...record.runs.at(-1), id: 'follow-latest', threadId: 'thr_latest' });
    record.version++; window.factoryRefresh();
  });
  await page.waitForFunction(() =>
    document.querySelector('#preview-manual .tb-session-picker select')?.value === 'follow-latest');
  assert.equal(await sessionSelect.inputValue(), 'follow-latest');
  await page.evaluate(() => {
    window.factoryFixture.runs.pop();
    window.factoryFixture.version++;
    window.factoryRefresh();
  });
  await manual.locator('.tb-stage-rail').getByRole('button', { name: /Investigate/ }).click();
  await sessionSelect.selectOption('investigate-run');
  await page.evaluate(() => window.factoryRefresh());
  assert.equal(await sessionSelect.inputValue(), 'investigate-run');
  await manual.getByRole('tab', { name: 'Result', exact: true }).click();
  await manual.getByText('Bounded investigation findings.', { exact: true }).waitFor();
  assert.equal(await manual.getByText('Preserve filters per project.', { exact: true }).count(), 0);
  await page.evaluate(() => {
    const record = window.factoryFixture;
    record.runs.push({ ...record.runs.at(-1), id: 'new-build', kind: 'build', threadId: 'thr_build',
      status: 'finished', output: 'Build needs more work.', reviewResult: null,
      buildResult: { verdict: 'blocked', summary: 'Build needs more work.', revision: null } });
    record.version++; window.factoryRefresh();
  });
  assert.equal(await sessionSelect.inputValue(), 'investigate-run');
  assert.equal(await manual.getByRole('button', { name: 'Continue in thread', exact: true }).count(), 1);
  await manual.locator('.tb-session-picker').getByRole('button', { name: 'Open session', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_investigate']);
  await page.evaluate(() => {
    const record = window.factoryFixture;
    record.runs = record.runs.filter(run => run.id !== 'investigate-run');
    record.version++;
    window.factoryRefresh();
  });
  await page.waitForFunction(() =>
    document.querySelector('#preview-manual .tb-session-picker select')?.value === 'new-build');
  assert.equal(await sessionSelect.inputValue(), 'new-build');
  assert.equal(await manual.locator('.tb-session-picker').getByRole('button', { name: 'Open session', exact: true }).count(), 1);
  await manual.locator('.tb-session-picker').getByRole('button', { name: 'Open session', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_investigate', 'thr_build']);
  await page.evaluate(() => {
    const record = window.factoryFixture;
    record.runs.pop();
    record.version++;
    window.factoryRefresh();
  });
  await page.waitForFunction(() =>
    document.querySelector('#preview-manual .tb-session-picker select')?.value === 'run');
  assert.equal(await sessionSelect.inputValue(), 'run');
  await manual.locator('.tb-stage-rail').getByRole('button', { name: /Build/ }).click();
  await manual.getByText('No build attempt recorded.', { exact: true }).waitFor();
  assert.equal(await sessionSelect.count(), 0);
  await manual.getByRole('button', { name: 'Follow current', exact: true }).click();
  assert.equal(await sessionSelect.inputValue(), 'run');
  await manual.getByRole('tab', { name: 'Plan', exact: true }).click();
  await manual.getByText('Edit implementation plan', { exact: true }).click();
  await manual.getByRole('button', { name: 'Save revision' }).click();
  await manual.getByRole('button', { name: 'Approve revision 1' }).click();
  assert.equal(await page.evaluate(() => window.factoryFixture.approvedDigest), 'preview-plan');
  await manual.getByRole('textbox', { name: 'Implementation plan' }).fill('Revised scope');
  await manual.getByRole('button', { name: 'Save revision' }).click();
  await manual.getByRole('button', { name: 'Approve revision 2' }).waitFor();
  assert.equal(await manual.getByRole('button', { name: 'Start build' }).count(), 0);
  await page.locator('#preview-card').getByRole('button', { name: 'Start task', exact: true }).click();
  assert.equal(await page.evaluate(() => window.factoryStarts), 0);
  const startDialog = page.getByRole('dialog', { name: 'Start task' });
  await startDialog.getByRole('combobox', { name: 'AI provider' }).selectOption('codex:gpt-5');
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-start-task-model.png') });
  assert.equal(await page.evaluate(() => window.factoryStarts), 0);
  await startDialog.getByRole('button', { name: 'Start task', exact: true }).click();
  assert.equal(await page.evaluate(() => window.factoryStarts), 1);
  assert.deepEqual(await page.evaluate(() => window.factoryStartExecution), {
    providerId: 'codex', model: 'gpt-5', permissionMode: 'auto',
    reasoningLevel: 'medium', serviceTier: 'default'
  });
  assert.equal(await page.evaluate(() => localStorage.getItem('bb-taskboard:right-panel-pinned')), null);
  assert.deepEqual(await page.evaluate(() => window.factoryNavigation), ['thr_investigate', 'thr_build', 'thr_coordinator']);
  await manual.getByRole('tab', { name: 'Activity', exact: true }).click();
  await manual.locator('.tb-run[data-live="true"] .tb-live-mark').waitFor();
  assert.equal(await manual.locator('.tb-run[data-live="true"] .tb-live-mark').evaluate(el => getComputedStyle(el).animationName), 'tb-working');
  await manual.getByRole('tab', { name: 'Workspace', exact: true }).click();
  const empirical = manual.locator('.tb-empirical-progress');
  await empirical.getByText('demo-live-work').waitFor();
  await empirical.getByText('implement · r1').waitFor();
  await page.getByRole('button', { name: 'Awaiting input' }).click();
  await empirical.getByText('implement · r2').waitFor();
  await empirical.getByText('Answer the implementation question').waitFor();
  await page.getByRole('button', { name: 'Blocked', exact: true }).click();
  await empirical.getByText('review · r3').waitFor();
  await empirical.getByText('Resolve review findings').waitFor();
  await page.getByRole('button', { name: 'Host offline' }).click();
  await empirical.getByText('Stale').waitFor();
  await empirical.getByText('The host is offline or Empirical did not respond.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await empirical.getByText('review · r3').waitFor();
  await page.getByRole('button', { name: 'Implemented only' }).click();
  await empirical.getByText('done · r4').waitFor();
  await empirical.getByText('implemented · workflow').waitFor();
  await page.getByRole('button', { name: 'Verified', exact: true }).click();
  await empirical.getByText('done · r5').waitFor();
  await empirical.getByText('verified · workflow').waitFor();
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-empirical-demo.png') });
  await manual.getByRole('tab', { name: 'Activity', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await manual.locator('.tb-run[data-live="true"] .tb-live-mark').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#preview-detail .tb-detail-meta').getByText('In progress', { exact: true }).waitFor({ state: 'attached' });
  for (const width of [1280, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = width >= 960;
    assert.equal(await page.locator('#preview-detail .tb-detail-context').isVisible(), wide ? true : false);
    assert.equal(await page.locator('#preview-detail .tb-detail-switch').isVisible(), !wide);
    if (!wide) {
      await page.locator('#preview-detail .tb-detail-switch').getByRole('tab', { name: 'Ticket' }).click();
      assert.equal(await page.locator('#preview-detail .tb-detail-context').isVisible(), true);
      assert.equal(await page.locator('#preview-detail .tb-comment-entry').count(), 2);
      assert.equal(await page.locator('#preview-detail .tb-detail-source[data-source="linear"]').count(), 1);
      assert.equal(await page.locator('#preview-detail .tb-detail-status[data-state-category="in_progress"]').count(), 1);
      if (width === 390) {
        const detail = page.locator('#preview-detail');
        await detail.getByRole('combobox', { name: 'Priority: Urgent' }).click();
        await page.getByRole('option', { name: 'High', exact: true }).click();
        await detail.getByRole('combobox', { name: /Assignee:/ }).click();
        await page.getByRole('option', { name: 'mateo rodriguez', exact: true }).click();
        await detail.getByRole('combobox', { name: /External project:/ }).click();
        await page.getByRole('option', { name: 'Roten Market', exact: true }).click();
        await detail.getByRole('textbox', { name: 'Comment' }).fill('This comment was posted from the Taskboard inspector.');
        await detail.getByRole('button', { name: 'Comment', exact: true }).click();
        await detail.getByText('This comment was posted from the Taskboard inspector.').waitFor();
        assert.deepEqual(await page.evaluate(() => ({
          priority: window.factoryItem.priority,
          assignee: window.factoryItem.assignee,
          project: window.factoryItem.project,
          comments: window.factoryItem.comments.length
        })), {
          priority: 'High',
          assignee: 'mateo rodriguez',
          project: 'Roten Market',
          comments: 3
        });
        await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-ticket-comments-mobile.png'), fullPage: true });
      }
      await page.locator('#preview-detail .tb-detail-switch').getByRole('tab', { name: 'Factory' }).click();
    }
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
  await manual.getByRole('status').getByText('Review found blockers. Return to Build with the findings to continue.', { exact: true }).waitFor();
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
  await manual.getByRole('tab', { name: 'Plan', exact: true }).click();
  if (!await manual.getByRole('textbox', { name: 'Implementation plan' }).isVisible()) {
    await manual.getByText('Edit implementation plan', { exact: true }).click();
  }
  await manual.getByRole('textbox', { name: 'Implementation plan' }).waitFor();
  await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, 'taskboard-review-repair-limit.png'), fullPage: true });
  await page.evaluate(() => {
    const record = window.factoryFixture;
    record.automationError = null; record.stage = 'Build'; record.version++;
    record.runs = [{ ...record.runs[1], id: 'blocked-build', kind: 'build', status: 'finished',
      error: null, repairOf: null, reviewResult: null,
      buildResult: { verdict: 'blocked', summary: 'Finish remaining work', revision: null } }];
    window.factoryStartDelay = 300;
    window.factoryStartError = 'Git checkout is unavailable';
    window.factoryRefresh();
  });
  const startsBeforeContinue = await page.evaluate(() => window.factoryStarts);
  const navigationBeforeContinue = await page.evaluate(() => window.factoryNavigation.length);
  await manual.getByRole('button', { name: 'Continue in thread', exact: true }).click();
  assert.equal(await manual.getByRole('button', { name: 'Continuing...', exact: true }).isDisabled(), true);
  await manual.getByText('Build could not continue', { exact: true }).waitFor();
  const continuationNotice = manual.locator('.tb-error-notice').filter({ hasText: 'Build could not continue' });
  assert.equal(await continuationNotice.locator('details').getAttribute('open'), null);
  await continuationNotice.getByText('Technical details', { exact: true }).click();
  await continuationNotice.getByText('Git checkout is unavailable', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.factoryNavigation.length), navigationBeforeContinue);
  assert.equal(await page.evaluate(() => window.factoryStarts), startsBeforeContinue + 1);
  await page.evaluate(() => { window.factoryStartError = null; });
  await manual.getByRole('button', { name: 'Continue in thread', exact: true }).click();
  await manual.getByText('Continuing Build', { exact: true }).waitFor();
  await page.waitForFunction(count => window.factoryNavigation.length > count, navigationBeforeContinue);
  assert.equal(await page.evaluate(() => window.factoryStarts), startsBeforeContinue + 2);
  assert.equal(await page.evaluate(() => window.factoryNavigation.at(-1)), 'thr_build');
  for (const status of ['failed', 'canceled']) {
    await page.evaluate(status => {
      const record = window.factoryFixture;
      record.runs = [{ ...record.runs.at(-1), id: `build-${status}`, status, buildResult: null }];
      record.version++; window.factoryRefresh();
    }, status);
    await manual.getByRole('button', { name: 'Retry build', exact: true }).waitFor();
    assert.equal(await manual.getByRole('button', { name: 'Start build', exact: true }).count(), 0);
    assert.equal(await manual.getByRole('button', { name: 'Continue in thread', exact: true }).count(), 0);
    const startsBeforeOpen = await page.evaluate(() => window.factoryStarts);
    await manual.locator('.tb-session-picker').getByRole('button', { name: 'Open session', exact: true }).click();
    assert.equal(await page.evaluate(() => window.factoryStarts), startsBeforeOpen);
  }
  await page.evaluate(() => {
    const record = window.factoryFixture;
    const error = 'Provider request failed: connection closed while reading ' + '/workspace/very-long-path/'.repeat(15);
    record.runs = [{ ...record.runs.at(-1), status: 'failed', error, activity: error }];
    record.automationError = error;
    record.version++; window.factoryRefresh();
  });
  await manual.getByText('Build could not finish', { exact: true }).waitFor();
  assert.equal(await manual.locator('.tb-error-notice').count(), 1);
  assert.equal(await manual.locator('.tb-error-notice details').getAttribute('open'), null);
  await page.locator('#preview-result').getByRole('status').getByText('Review · Blocked', { exact: true }).waitFor();
  for (const dark of [false, true]) {
    await page.evaluate(dark => {
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.cssText = dark
        ? '--canvas:#202124;--ink:#ececf0;--background:#202124;--foreground:#ececf0;--muted-foreground:#a2a4ae;--border:#393b42;--timeline-accent:#7ba8fa;--success:#69c69b;--destructive:#f18694;--destructive-text:#f18694;--surface-recessed-soft-solid:#292a2f'
        : '';
    }, dark);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await manual.locator('.tb-error-notice summary').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-result-errors-${dark ? 'dark' : 'light'}-${width}.png`), fullPage: true });
      await manual.locator('.tb-error-notice summary').click();
    }
  }
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.cssText = '';
  });
  await page.getByRole('button', { name: 'Team ready', exact: true }).click();
  const team = manual.locator('[data-factory-team]');
  await manual.getByRole('tab', { name: 'Activity', exact: true }).click();
  await manual.locator('.tb-run').waitFor();
  assert.equal(await manual.locator('.tb-run').count(), 1);
  await manual.getByRole('tab', { name: 'Workspace', exact: true }).click();
  await team.getByRole('button', { name: 'Open coordinator thread', exact: true }).click();
  assert.equal(await page.evaluate(() => window.factoryNavigation.at(-1)), 'thr_coordinator');
  await manual.locator('.tb-stage-rail').getByRole('button', { name: /Build/ }).click();
  await team.locator('.tb-session-picker').getByRole('button', { name: 'Open session', exact: true }).click();
  assert.equal(await page.evaluate(() => window.factoryNavigation.at(-1)), 'thr_build');
  await manual.getByRole('tab', { name: 'Workspace', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.evaluate(() => { window.factoryFixture.version++; window.factoryRefresh(); });
  await page.waitForTimeout(100);
  assert.equal(await manual.getByRole('tab', { name: 'Workspace', exact: true }).getAttribute('aria-selected'), 'true');
  for (const scenario of [
    ['Factory paused', 'Factory paused. Existing sessions remain available, but no new automatic stage will start.'],
    ['Provider read failed', 'Provider unavailable. The live provider request failed.'],
    ['Stale eligibility', 'Provider status stale. Eligibility could not be confirmed. provider-eligibility-request-with-a-long-unbroken-identifier-for-the-configured-project'],
    ['Scope changed', 'Scope changed. Review the updated ticket before continuing.'],
    ['Ticket closed', 'Ticket closed. No new automatic stages will start.'],
    ['Coordinator unavailable', 'The coordinator is archived. Restore the original thread.'],
    ['Coordinator uncertain', 'The native response was lost.']
  ]) {
    await page.getByRole('button', { name: scenario[0], exact: true }).click();
    await team.locator('[data-team-blocker]').getByText(scenario[1], { exact: true }).waitFor();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await team.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-team-${scenario[0].toLowerCase().replaceAll(' ', '-')}-${width}.png`) });
    }
    assert.equal(await team.locator('[data-team-blocker]').isVisible(), true);
  }
  await team.getByRole('textbox', { name: 'Recovered coordinator thread ID' }).fill('thr_recovered_coordinator');
  await team.getByRole('button', { name: 'Link coordinator', exact: true }).click();
  await team.getByRole('button', { name: 'Open coordinator thread' }).click();
  assert.equal(await page.evaluate(() => window.factoryNavigation.at(-1)), 'thr_recovered_coordinator');
  await page.getByRole('button', { name: 'Coordinator rejected', exact: true }).click();
  await team.getByRole('button', { name: 'Retry coordinator', exact: true }).click();
  await team.getByRole('button', { name: 'Open coordinator thread' }).waitFor();
  await page.getByRole('button', { name: 'Legacy team', exact: true }).click();
  await team.getByText('Legacy sessions', { exact: true }).last().waitFor();
  await team.getByRole('button', { name: 'Add coordinator', exact: true }).click();
  await team.getByText('Legacy session', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.factoryFixture.coordinator = { status: 'pending' };
    window.factoryFixture.runs = [];
    window.factoryFixture.version++; window.factoryRefresh();
  });
  await team.getByText('pending', { exact: true }).waitFor();
  assert.equal(await team.getByRole('button', { name: /^Open .* thread$/ }).count(), 0);
  assert.equal(await manual.getByRole('button', { name: 'Start task', exact: true }).count(), 0);
  await page.evaluate(() => {
    window.factoryFixture.admission = { kind: 'manual' };
    window.factoryFixture.automationError = null;
    window.factoryFixture.version++; window.factoryRefresh();
  });
  await manual.getByRole('button', { name: 'Start task', exact: true }).waitFor();
  await page.evaluate(() => {
    window.factoryFixture.coordinator = null;
    window.factoryFixture.version++; window.factoryRefresh();
  });
  assert.equal(await manual.getByRole('button', { name: 'Start task', exact: true }).isEnabled(), true);
  for (const state of ['running', 'paused', 'awaiting_scan', 'unconfigured', 'provider_error']) {
    await page.evaluate(state => { window.factoryProjectState = state; window.factoryRefresh(); }, state);
    const expected = state === 'unconfigured' || state === 'provider_error' ? 'Blocked'
      : state === 'awaiting_scan' || state === 'paused' ? 'Paused'
      : state === 'running' ? 'Running' : 'Disabled';
    await factorySettings.getByText(expected, { exact: true }).first().waitFor();
    if (state === 'awaiting_scan') {
      await factorySettings.getByText('Queue size is unknown until a successful provider scan.', { exact: false }).waitFor();
      await factorySettings.getByText('Automatic intake is enabled and awaiting its first provider scan.').waitFor();
      assert.equal(await factorySettings.getByText('Factory paused. No new automatic stages will start.').count(), 0);
    } else if (state === 'running') {
      await factorySettings.getByText('3 last-known unclaimed todo tickets within the 500-ticket scan window', { exact: false }).waitFor();
      await factorySettings.getByText('Healthy', { exact: true }).waitFor();
    } else if (state === 'provider_error') {
      await factorySettings.getByText('Live provider scan failed.', { exact: false }).waitFor();
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await factorySettings.screenshot({ path: resolve(process.env.BB_THREAD_STORAGE, `taskboard-factory-state-${state}-${width}.png`) });
    }
  }
  await page.evaluate(() => {
    window.factoryFixture.admission = { kind: 'factory', claimedAt: new Date().toISOString() };
    window.factoryFixture.automationError = null;
    window.factoryProjectState = 'paused';
    window.factoryRefresh();
  });
  await team.locator('[data-team-blocker]').getByText('Factory paused.', { exact: false }).waitFor();
  const readsBefore = await page.evaluate(() => window.factoryProjectReads);
  await page.evaluate(() => {
    window.factoryProjectDelay = 250;
    window.factoryRefresh();
  });
  await page.waitForFunction(reads => window.factoryProjectReads > reads, readsBefore);
  await page.evaluate(() => {
    window.factoryProjectDelay = 0;
    window.factoryProjectState = 'running';
    window.factoryRefresh();
  });
  await factorySettings.getByText('Running', { exact: true }).waitFor();
  await team.locator('[data-team-blocker]').waitFor({ state: 'hidden' });
  await page.waitForTimeout(300);
  assert.equal(await team.locator('[data-team-blocker]').count(), 0);
  assert.equal(await factorySettings.getByText('Paused', { exact: true }).count(), 0);
  await page.evaluate(() => {
    window.factoryProjectState = 'awaiting_scan';
    window.factoryRefresh();
  });
  await team.locator('[data-team-blocker]')
    .getByText('Automatic intake is enabled and awaiting its first provider scan.').waitFor();
  await page.evaluate(() => {
    window.factoryProjectState = 'paused';
    window.factoryRefresh();
  });
  await team.locator('[data-team-blocker]').getByText('Factory paused.', { exact: false }).waitFor();
  const readsBeforeSwitch = await page.evaluate(() => window.factoryProjectReads);
  await page.evaluate(() => {
    window.factoryProjectDelay = 250;
    window.factoryRefresh();
  });
  await page.waitForFunction(reads => window.factoryProjectReads > reads, readsBeforeSwitch);
  await page.evaluate(() => {
    window.factoryProjectDelay = 0;
    window.factoryProjectState = 'running';
    window.factoryFixture.projectId = 'proj_other';
    window.factoryPreviewProject('proj_other');
  });
  await factorySettings.getByText('Running', { exact: true }).waitFor();
  await team.locator('[data-team-blocker]').waitFor({ state: 'hidden' });
  await page.waitForTimeout(300);
  assert.equal(await team.locator('[data-team-blocker]').count(), 0);
  assert.equal(await factorySettings.getByText('Paused', { exact: true }).count(), 0);
  for (const start of [false, true]) {
    await page.goto(`https://taskboard-preview.test/?creation=${start}`);
    await page.getByLabel('Title', { exact: true }).fill('Fix screenshot layout');
    await page.getByLabel('Description', { exact: true }).fill('Match the attached screenshot.');
    await page.getByRole('button', { name: 'Create only', exact: true }).waitFor();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('AI for this task').first().waitFor();
    const aiProvider = dialog.getByRole('combobox', { name: 'AI provider' });
    assert.equal(await aiProvider.inputValue(), 'claude:claude-sonnet');
    await dialog.locator('img[src^="data:image/svg"]').first().waitFor();
    assert.equal(await dialog.getByRole('combobox', { name: 'Improvement detail' }).innerText(), 'Concise');
    if (start) {
      await aiProvider.selectOption('codex:gpt-5');
      assert.equal(await aiProvider.inputValue(), 'codex:gpt-5');
    }
    await dialog.getByRole('combobox', { name: 'Improvement detail' }).click();
    await page.getByRole('option', { name: 'Detailed' }).click();
    await dialog.getByRole('button', { name: 'Improve title & description' }).click();
    await page.waitForFunction(() => document.querySelector('input[id$="-title"]')?.value === 'Improved title');
    const improvement = await page.evaluate(() => window.ticketImprovementInputs.at(-1));
    assert.equal(improvement.detail, 'detailed');
    assert.equal(improvement.execution.providerId, start ? 'codex' : 'claude');
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
    if (start) assert.equal(await aiProvider.inputValue(), 'codex:gpt-5');
    await page.getByRole('button', { name: start ? 'Start now' : 'Create only', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.createdInputs.length), 1);
    assert.equal(await page.evaluate(() => window.factoryStarts), start ? 1 : 0);
    assert.equal(await page.evaluate(() => window.createdInputs[0].images.length), start ? 0 : 1);
    if (start) assert.equal(await page.evaluate(() => window.factoryStartExecution?.providerId), 'codex');
    if (!start) assert.equal(await page.evaluate(() => window.factoryNavigation.at(-1)), 'item/proj_test/linear/issue-42');
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop: 'passed', panel: 'passed', mobile: 'passed', kanbanStart: 'passed', liveStatus: 'passed', navigation: 'passed', staleApproval: 'passed', automaticActions: 'passed', reviewBlockers: 'passed', returnToBuild: 'passed', repairLimit: 'passed', coordinatorHierarchy: 'passed', coordinatorRecovery: 'passed', legacyAdoption: 'passed', keyboardDisclosure: 'passed', refreshRetention: 'passed', projectFactoryStates: 'passed', errors }));
  }
} catch (error) {
  console.error(JSON.stringify({ errors, page: await page.locator('body').innerText() }));
  throw error;
} finally { await browser.close(); }
}
