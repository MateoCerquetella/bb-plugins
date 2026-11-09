// Run the preview server first: TASKBOARD_DEMO_PORT=8437 node plugins/taskboard/scripts/factory-browser-check.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve(process.env.BB_THREAD_STORAGE ?? '/tmp/taskboard-role-ui');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.TASKBOARD_PREVIEW_URL ?? 'http://127.0.0.1:8437');
  const settings = page.getByRole('form', { name: 'Autonomous factory', exact: true });
  const orchestrator = settings.getByRole('group', { name: 'Orchestrator AI', exact: true });
  const workers = settings.getByRole('group', { name: 'Worker AI', exact: true });
  const ai = group => group.getByRole('combobox', { name: 'AI provider', exact: true });
  const reasoning = group => group.getByRole('combobox', { name: 'Reasoning level', exact: true });
  const save = async () => {
    await settings.getByRole('button', { name: 'Save changes', exact: true }).click();
    await settings.getByRole('button', { name: 'Save settings', exact: true }).waitFor();
  };
  await ai(orchestrator).selectOption('claude:claude-sonnet');
  await reasoning(orchestrator).selectOption('high');
  await ai(workers).selectOption('codex:gpt-5');
  await reasoning(workers).selectOption('low');
  await save();
  // Reproduce native initial normalization before a delayed policy response.
  await page.evaluate(() => {
    window.factoryPickerInitialNormalization = true;
    window.factoryProjectDelay = 200;
  });
  // Remount the settings to prove they are read back through the RPC boundary.
  await page.evaluate(() => window.factoryPreviewProject('proj_other'));
  await page.waitForFunction(projectId => {
    const form = document.querySelector('form[aria-label="Autonomous factory"]');
    return document.querySelector('#preview-factory-settings')?.dataset.projectId === projectId && form && !form.querySelector('button[type="submit"]').disabled &&
      !form.textContent.includes('Reading the current AI selection');
  }, 'proj_other');
  assert.equal(await settings.getByText('Unsaved', { exact: true }).count(), 0);
  assert.equal(await ai(orchestrator).inputValue(), 'codex:gpt-5');
  await page.evaluate(() => window.factoryPreviewProject('proj_test'));
  await page.waitForFunction(projectId => {
    const form = document.querySelector('form[aria-label="Autonomous factory"]');
    return document.querySelector('#preview-factory-settings')?.dataset.projectId === projectId && form && !form.querySelector('button[type="submit"]').disabled &&
      !form.textContent.includes('Reading the current AI selection');
  }, 'proj_test');
  assert.equal(await settings.getByText('Unsaved', { exact: true }).count(), 0);
  assert.equal(await ai(orchestrator).inputValue(), 'claude:claude-sonnet');
  assert.equal(await reasoning(orchestrator).inputValue(), 'high');
  assert.equal(await ai(workers).inputValue(), 'codex:gpt-5');
  assert.equal(await reasoning(workers).inputValue(), 'low');
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await settings.screenshot({ path: resolve(output, `taskboard-roles-${width}.png`) });
  }
  await workers.getByRole('button', { name: 'Use project defaults', exact: true }).click();
  await save();
  assert.equal(await reasoning(workers).inputValue(), 'medium');
  assert.equal(await reasoning(orchestrator).inputValue(), 'high');
  await orchestrator.getByRole('button', { name: 'Use project defaults', exact: true }).click();
  await save();
  assert.equal(await ai(orchestrator).inputValue(), 'codex:gpt-5');
  assert.equal(await reasoning(orchestrator).inputValue(), 'medium');
  assert.deepEqual(errors, []);
  const results = ['Independent models and reasoning', 'Save and RPC reload', 'Project isolation',
    'Independent reset', 'Desktop and mobile layout', 'No browser errors']
    .map(name => ({ name, status: 'passed' }));
  await writeFile(resolve(output, 'taskboard-role-ui-tests.json'), JSON.stringify(results, null, 2));
  console.log('Factory role settings browser checks passed.');
} finally { await browser.close(); }
