import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { executionRpc } from '../../../../plugins/taskboard/execution/contract.ts';
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      '/tmp/taskboard-ui-test/node_modules/playwright/index.mjs'
  ).href
);
const base = process.env.TASKBOARD_TEST_URL || 'http://127.0.0.1:50577';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw new Error('UI fixture must run against isolated loopback BB');
const out = '.empirical/specs/taskboard-symphony-execution/qa';
await mkdir(out, { recursive: true });
const item = {
  bbProjectId: 'proj_fixture',
  source: 'github',
  locator: 'owner/repo#1',
  key: 'BB-123',
  title: 'Add configurable themes',
  description:
    'Let users choose a theme and preserve their choice after reload.',
  url: 'https://github.com/owner/repo/issues/1',
  status: 'In Progress',
  stateCategory: 'in_progress',
  priority: 'Medium',
  assignee: 'Mateo',
  project: 'BB plugins',
  labels: [],
  updatedAt: '2026-09-28T02:00:00Z',
  comments: []
};
let enabled = false;
let run = null;
let dispatched = 0;
const pageErrors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.TASKBOARD_CHROMIUM
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1
});
page.on('pageerror', error => pageErrors.push(error.message));
await page.route('**/api/v1/plugins/taskboard/rpc/*', async route => {
  const method = new URL(route.request().url()).pathname.split('/').at(-1);
  let result;
  const rawInput = route.request().postDataJSON();
  const schema = executionRpc[method];
  const parsed = schema?.input.safeParse(rawInput);
  if (parsed && !parsed.success) {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'invalid_input', message: parsed.error.message }
      })
    });
    return;
  }
  const input = parsed ? parsed.data : rawInput;
  switch (method) {
    case 'getItem':
      result = { item };
      break;
    case 'listProjects':
      result = { projects: [{ id: item.bbProjectId, name: 'BB plugins' }] };
      break;
    case 'executionConfig':
      result = {
        enabled,
        defaultEngine: 'symphony',
        endpoint: 'http://127.0.0.1:4000',
        runtimeId: 'fixture',
        workspaceRoot: '/tmp/taskboard-fixture',
        maxConcurrency: 4,
        maxRetries: 3,
        runTimeoutMs: 3600000,
        maxFixIterations: 2
      };
      break;
    case 'executionStatus':
      result = { runs: run ? [run] : [] };
      break;
    case 'executionDefaults':
      result = {
        repository: '/tmp/fixture-repository',
        baseBranch: 'main',
        baseRevision: 'a'.repeat(40)
      };
      break;
    case 'getProjectBoardSettings':
      result = {
        settings: {
          projectId: item.bbProjectId,
          defaultView: 'list',
          enabledFilters: [
            'state',
            'status',
            'assignee',
            'priority',
            'project',
            'labels'
          ],
          statusOrder: []
        }
      };
      break;
    case 'prepareExecution':
      result = {
        engine: 'symphony',
        digest: 'fixture-digest',
        prompt: 'fixture prompt',
        request: {
          schemaVersion: 1,
          taskId: 'fixture-task',
          task: input.task,
          title: item.title,
          description: item.description,
          scope: input.scope,
          metadata: { trackerKey: item.key, trackerUrl: item.url }
        }
      };
      break;
    case 'startExecution':
      dispatched++;
      run = {
        id: 'tb_' + 'b'.repeat(32),
        request: input.request,
        digest: input.digest,
        state: 'running',
        engine: 'symphony',
        generation: 1,
        iteration: 1,
        workspace: '/tmp/taskboard-fixture/tb_example',
        agent: 'Codex',
        runId: 'fixture-session',
        startedAt: '2026-09-28T02:30:00Z',
        endedAt: null,
        pr: null,
        retryCount: 0,
        lastError: null,
        checks: [],
        head: null,
        verifiedHead: null,
        acceptanceReviewed: false,
        runtimeReleased: false,
        version: 1
      };
      result = run;
      break;
    case 'executionAction':
      run = {
        ...run,
        state: input.action === 'stop' ? 'canceling' : 'verified',
        version: run.version + 1
      };
      result = run;
      break;
    default:
      return route.continue();
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, result })
  });
});
const url =
  base + '/plugins/taskboard/tasks/item/proj_fixture/github/owner~2Frepo~231';
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('heading', { name: item.title, exact: true })
    .waitFor({ timeout: 30000 });
  await page
    .getByRole('button', { name: 'Send to agent', exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Execute', exact: true }).count(),
    0
  );
  await page.screenshot({ path: out + '/local.png', fullPage: true });
  enabled = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Execute', exact: true }).click();
  await page
    .getByLabel('Approved plan', { exact: true })
    .fill(
      'Add the theme setting. Preserve the default. Cover persistence and fallback.'
    );
  await page
    .getByLabel('Acceptance criteria (one per line)', { exact: true })
    .fill('Theme choice survives reload.\nExisting users keep the default.');
  await page
    .getByRole('button', { name: 'Review request', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Approve and execute', exact: true })
    .waitFor();
  await page.screenshot({ path: out + '/review.png', fullPage: true });
  await page
    .getByRole('button', { name: 'Approve and execute', exact: true })
    .click();
  await page.getByText('Implementation running', { exact: true }).waitFor();
  assert.equal(dispatched, 1);
  await page.getByText('Execution details', { exact: true }).click();
  await page.screenshot({ path: out + '/running.png', fullPage: true });
  run = {
    ...run,
    state: 'implementation_complete',
    head: 'c'.repeat(40),
    verifiedHead: 'c'.repeat(40),
    runtimeReleased: true,
    checks: [
      {
        id: 'check_1',
        passed: true,
        reused: false,
        output: 'All checks passed'
      }
    ],
    version: 2
  };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', {
      name: 'Confirm acceptance criteria are satisfied',
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByText('Checks passed · acceptance review required', { exact: true })
      .count(),
    1
  );
  await page
    .getByRole('button', {
      name: 'Confirm acceptance criteria are satisfied',
      exact: true
    })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Verification passed' })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + '/mobile-verified.png', fullPage: true });
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  await writeFile(
    out + '/result.json',
    JSON.stringify(
      {
        url,
        passed: true,
        dispatched,
        scenarios: [
          'disabled local compatibility',
          'review approved work',
          'one dispatch',
          'running status',
          'independent acceptance review',
          'mobile verified status'
        ],
        pageErrors,
        backend: 'synthetic RPC fixtures; plugin rendered by isolated BB 0.40.0'
      },
      null,
      2
    )
  );
  console.log('Taskboard browser fixture passed');
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true });
  await writeFile(
    out + '/failure.txt',
    (await page.locator('body').innerText()) + '\n' + pageErrors.join('\n')
  );
  throw error;
} finally {
  await browser.close();
}
