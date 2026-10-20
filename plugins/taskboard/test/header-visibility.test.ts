import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

test('header controls can be hidden independently and restored', async t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/'
  });
  dom.window.matchMedia = query => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => true
  });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle']) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: Reflect.get(dom.window, key)
    });
  }
  const directory = await mkdtemp(fileURLToPath(new URL('./.header-test-', import.meta.url)));
  t.after(async () => {
    dom.window.close();
    await rm(directory, { recursive: true, force: true });
  });
  await build({
    entryPoints: [new URL('../app.tsx', import.meta.url).pathname],
    outfile: `${directory}/app.mjs`,
    bundle: true,
    packages: 'external',
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' }
  });
  const { loadPluginApp, renderSlot } = await import('@get-bb/plugin-sdk/testing/app');
  const app = await loadPluginApp(() => import(`${directory}/app.mjs`));
  const progress = app.threadHeaderActions.find(action => action.id === 'taskboard-live-progress');
  const pin = app.threadHeaderActions.find(action => action.id === 'open-taskboard-panel');
  assert.ok(progress);
  assert.ok(pin);
  const props = { threadId: 'thr_test', projectId: 'proj_test', isCompactViewport: false };
  const record = {
    version: 1, stage: 'Build', automationError: null,
    plans: [], approvedDigest: null,
    trackerProgress: { status: 'pending', message: null },
    updatedAt: '2026-01-01T00:00:00Z',
    runs: [{ id: 'run', kind: 'build', status: 'running', steps: [], activity: 'Working' }]
  };
  for (const [showProgress, showPin] of [[true, true], [false, true], [true, false], [false, false], [true, true]]) {
    const settings = {
      showThreadHeaderProgress: showProgress,
      showThreadHeaderPin: showPin
    };
    const progressSlot: ReturnType<typeof renderSlot> = renderSlot(progress, props, {
      settings,
      rpc: { factoryForThread: () => ({ record }) }
    });
    const pinSlot: ReturnType<typeof renderSlot> = renderSlot(pin, props, { settings });
    if (showProgress) await progressSlot.findByRole('button', { name: 'Task progress: Build, In progress' });
    assert.equal(progressSlot.container.querySelectorAll('button').length, showProgress ? 1 : 0);
    assert.equal(pinSlot.container.querySelectorAll('button').length, showPin ? 1 : 0);
    progressSlot.unmount();
    pinSlot.unmount();
  }
});
