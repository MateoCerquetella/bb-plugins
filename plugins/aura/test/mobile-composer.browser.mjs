// Real New thread UI at phone and desktop widths. Read-only: routes the Aura
// RPC with a fixture snapshot so the user's saved background is untouched.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.BB_BASE_URL || 'http://127.0.0.1:38886';
const shots = process.env.BB_SCREENSHOT_DIR || process.env.BB_THREAD_STORAGE;
if (!shots) throw new Error('Set BB_SCREENSHOT_DIR');
await mkdir(shots, { recursive: true });
const saved = (await (await fetch(base + '/api/v1/plugins/aura/rpc/get', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' })).json()).result;
const state = { ...saved, settings: { ...saved.settings, enabled: true, newThreadOnly: false, dimmerEnabled: true } };
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BB_CHROMIUM_PATH ? { executablePath: process.env.BB_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(20000);
  await page.route('**/api/v1/plugins/aura/rpc/get', route => route.fulfill({ json: { ok: true, result: state } }));
  await page.goto(base);
  await page.locator('#root-compose-main-panel .aura-capy-ink[data-half-wallpaper] canvas[data-rendered]').waitFor();
  await page.waitForTimeout(500);

  const measure = () => page.evaluate(() => {
    const panel = document.querySelector('#root-compose-main-panel');
    const box = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, width: r.width }; };
    const composer = panel.querySelector('[data-testid="root-compose-compact-composer"]');
    const viewport = panel.querySelector('[data-testid="root-compose-compact-scroll-viewport"]');
    const recents = panel.querySelector('[data-root-compose-mobile-recents]');
    const spacer = panel.querySelector('[data-testid="root-compose-compact-bottom-spacer"]');
    const fade = panel.querySelector('[data-testid="root-compose-compact-fade"]');
    return {
      panel: box(panel), composer: box(composer), recents: box(recents),
      composerPosition: getComputedStyle(composer).position,
      composerOrder: getComputedStyle(composer).order,
      spacerDisplay: spacer ? getComputedStyle(spacer).display : "absent",
      fadeDisplay: fade ? getComputedStyle(fade).display : "absent",
      viewportScrollable: viewport ? viewport.scrollHeight > viewport.clientHeight : false,
      overflow: panel.scrollWidth - panel.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      ink: !!panel.querySelector('.aura-capy-ink'),
      mask: getComputedStyle(panel.querySelector('.aura-capy-ink')).maskImage,
    };
  });

  const mobile = await measure();
  assert.equal(mobile.composerPosition, 'absolute', 'Mobile composer must keep the host absolute placement');
  assert.ok(Math.abs(mobile.composer.bottom - mobile.panel.bottom) <= 2, `Composer must sit at the panel bottom (composer ${mobile.composer.bottom}, panel ${mobile.panel.bottom})`);
  assert.ok(mobile.composer.top > mobile.panel.top + mobile.panel.height * 0.6, `Composer must start in the lower 40% (top ${mobile.composer.top})`);
  assert.ok(mobile.recents.top < mobile.composer.top, 'Recents must start above the composer');
  assert.ok(mobile.viewportScrollable, 'Recents must scroll above the composer');
  assert.equal(mobile.spacerDisplay, 'block', 'Native bottom spacer must be restored on mobile');
  assert.equal(mobile.fadeDisplay, 'block', 'Native fade must be restored on mobile');
  assert.ok(mobile.overflow <= 1 && mobile.pageOverflow <= 1, `No horizontal overflow (panel ${mobile.overflow}, page ${mobile.pageOverflow})`);
  assert.ok(mobile.ink, 'Wallpaper layer must render on mobile');
  assert.ok(mobile.mask.includes('50%'), 'Half wallpaper must still fade at the midpoint');
  await page.screenshot({ path: shots + '/new-thread-mobile.jpg', type: 'jpeg', quality: 88 });

  const composerTopBefore = mobile.composer.top;
  await page.evaluate(() => {
    const viewport = document.querySelector('#root-compose-main-panel [data-testid="root-compose-compact-scroll-viewport"]');
    viewport.scrollTop = viewport.scrollHeight;
  });
  await page.waitForTimeout(300);
  const scrolled = await measure();
  assert.ok(Math.abs(scrolled.composer.top - composerTopBefore) <= 1, 'Composer must stay pinned while recents scroll');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(800);
  const desktop = await measure();
  assert.notEqual(desktop.composerPosition, 'absolute', 'Desktop composition must re-center the composer');
  assert.equal(desktop.composerOrder, '-1', 'Desktop composer must be ordered first');
  assert.ok(desktop.composer.top < desktop.panel.top + desktop.panel.height * 0.45, `Desktop composer must sit in the upper half (top ${desktop.composer.top})`);
  assert.ok(['none', 'absent'].includes(desktop.spacerDisplay), 'Desktop composition must hide the compact spacer');
  assert.ok(['none', 'absent'].includes(desktop.fadeDisplay), 'Desktop composition must hide the compact fade');
  assert.ok(desktop.overflow <= 1 && desktop.pageOverflow <= 1, `No horizontal overflow on desktop (panel ${desktop.overflow}, page ${desktop.pageOverflow})`);
  await page.screenshot({ path: shots + '/new-thread-desktop.jpg', type: 'jpeg', quality: 88 });

  console.log('PASS: mobile composer pinned to the bottom with recents scrolling above; desktop composition unchanged.');
} finally {
  await browser.close();
}
