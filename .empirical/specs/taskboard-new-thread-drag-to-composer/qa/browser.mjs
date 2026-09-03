import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const npmRoot = execFileSync('npm', ['root', '--global'], {
  encoding: 'utf8'
}).trim();
const { chromium } = await import(
  pathToFileURL(join(npmRoot, 'playwright', 'index.mjs')).href
);
const context = JSON.parse(
  execFileSync('bb', ['status', '--json'], { encoding: 'utf8' })
);
const projectId = context.project?.id ?? 'proj_ykxahiys47';
const threadId = context.thread?.id ?? 'thr_axt3ycmenc';
const baseUrl = process.env.BB_SERVER_URL ?? 'http://127.0.0.1:38886';
const actionTitle = 'Taskboard Drag Preview';
const screenshotRoot =
  '.empirical/specs/taskboard-new-thread-drag-to-composer/qa';

async function openPreview(page, kind) {
  const newTab = page.locator('button[aria-label^="Open new tab"]');
  await newTab.waitFor({ state: 'attached', timeout: 15_000 });
  await newTab.dispatchEvent('click');
  const action = page
    .locator('[data-testid="new-tab-actions"]')
    .getByText(actionTitle, { exact: true });
  await action.waitFor({ state: 'visible', timeout: 15_000 });
  await action.click();
  const panelTestId =
    kind === 'new-thread'
      ? 'plugin-new-thread-panel-tab-content'
      : 'plugin-panel-tab-content';
  return page.locator(`[data-testid="${panelTestId}"]`);
}

async function dragPreviewTicket(page, panel, editor, initialText) {
  await editor.fill(initialText);
  const ticket = panel.locator('button[draggable="true"]');
  await ticket.waitFor({ state: 'visible', timeout: 15_000 });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await ticket.dispatchEvent('dragstart', { dataTransfer: transfer });
  await editor.dispatchEvent('dragover', { dataTransfer: transfer });
  await page.waitForTimeout(100);
  if (
    (await page.getByText('Drop to add ticket to chat', { exact: true }).count()) !==
      1 ||
    (await page.locator(
      'form[data-taskboard-composer-drop-target="active"]'
    ).count()) !== 1
  ) {
    throw new Error('The visible composer did not enter the accepted-drop state');
  }
  await page.screenshot({
    path: `${screenshotRoot}/new-thread-drag-active.png`,
    fullPage: true
  });
  await editor.dispatchEvent('drop', { dataTransfer: transfer });
  await page.waitForTimeout(200);
  const text = await editor.innerText();
  if (!text.includes(initialText) || !text.includes('TEST-1')) {
    throw new Error(`Composer did not preserve the draft and mention: ${text}`);
  }
  const status = await panel.getByRole('status').innerText();
  if (status !== 'Added TEST-1 to chat') {
    throw new Error(`Unexpected polite status: ${status}`);
  }
  return text;
}

const browser = await chromium.launch({ headless: true });
try {
  const newThreadPage = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });
  await newThreadPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  const newThreadEditor = newThreadPage
    .locator('[contenteditable="true"][role="textbox"]')
    .first();
  await newThreadEditor.waitFor({ state: 'visible', timeout: 15_000 });
  const newThreadPanel = await openPreview(newThreadPage, 'new-thread');
  const newThreadText = await dragPreviewTicket(
    newThreadPage,
    newThreadPanel,
    newThreadEditor,
    'Keep this draft'
  );
  await newThreadPage.screenshot({
    path: `${screenshotRoot}/new-thread-drop.png`,
    fullPage: true
  });

  const threadPage = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });
  await threadPage.goto(
    `${baseUrl}/projects/${projectId}/threads/${threadId}`,
    { waitUntil: 'domcontentloaded' }
  );
  const threadEditor = threadPage
    .locator('[contenteditable="true"][role="textbox"]')
    .first();
  await threadEditor.waitFor({ state: 'visible', timeout: 15_000 });
  const threadPanel = await openPreview(threadPage, 'thread');
  const threadText = await dragPreviewTicket(
    threadPage,
    threadPanel,
    threadEditor,
    'Existing thread draft'
  );

  process.stdout.write(
    `${JSON.stringify({
      newThread: newThreadText,
      existingThread: threadText,
      submitted: false
    })}\n`
  );
} finally {
  await browser.close();
}
