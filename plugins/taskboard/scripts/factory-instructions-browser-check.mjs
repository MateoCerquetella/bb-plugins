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
  const instructions = settings.getByRole('textbox', { name: 'Additional factory instructions' });
  const save = async () => {
    await settings.getByRole('button', { name: 'Save changes', exact: true }).click();
    await settings.getByRole('button', { name: 'Save settings', exact: true }).waitFor();
  };
  const text = '  Follow project conventions.\nRun the regression suite.\n';
  await instructions.fill(text);
  await save();
  // Remount the settings to prove they are read back through the RPC boundary.
  await page.evaluate(() => window.factoryPreviewProject('proj_other'));
  await page.waitForTimeout(100);
  assert.equal(await instructions.inputValue(), '');
  await page.evaluate(() => window.factoryPreviewProject('proj_test'));
  await page.waitForTimeout(100);
  assert.equal(await instructions.inputValue(), text);
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await settings.screenshot({ path: resolve(output, `taskboard-instructions-${width}.png`) });
  }
  await instructions.fill('');
  await save();
  assert.equal(await instructions.inputValue(), '');
  assert.deepEqual(errors, []);
  const results = ['Save and RPC reload', 'Project isolation',
    'Multiline prompt preserved', 'Clear instructions', 'Desktop and mobile layout', 'No browser errors']
    .map(name => ({ name, status: 'passed' }));
  await writeFile(resolve(output, 'taskboard-instructions-ui-tests.json'), JSON.stringify(results, null, 2));
  console.log('Factory instructions browser checks passed.');
} finally { await browser.close(); }
