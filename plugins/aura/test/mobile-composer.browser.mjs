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
    const recentsRows = recents ? [...recents.querySelectorAll("ul > li")] : [];
    const recentsStyle = element => { const cs = getComputedStyle(element); return { display: cs.display, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, background: cs.backgroundColor, blur: cs.backdropFilter, margin: cs.marginLeft }; };
    const spacer = panel.querySelector('[data-testid="root-compose-compact-bottom-spacer"]');
    const fade = panel.querySelector('[data-testid="root-compose-compact-fade"]');
    return {
      panel: box(panel), composer: box(composer), recents: box(recents),
      recentsSurface: recents ? recentsStyle(recents) : null,
      recentsHeader: recents ? { position: getComputedStyle(recents.firstElementChild).position, background: getComputedStyle(recents.firstElementChild).backgroundColor } : null,
      recentsRows: recentsRows.map(row => ({ background: getComputedStyle(row).backgroundColor, borderTop: getComputedStyle(row).borderTopWidth })),
      recentsLinkColor: recentsRows[0]?.querySelector("a") ? getComputedStyle(recentsRows[0].querySelector("a")).color : null,
      bodyColor: getComputedStyle(document.body).backgroundColor,
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
  assert.equal(mobile.recentsSurface.radius, '16px', 'Recent list must render as a rounded card');
  assert.equal(mobile.recentsSurface.border, '1px', 'Recent card must keep its border');
  assert.equal(mobile.recentsSurface.margin, '10px', 'Recent card must be inset from the screen edge');
  assert.match(mobile.recentsSurface.background, /0\.9\d\)/, 'Recent card must use an opaque themed surface');
  assert.ok(mobile.recentsSurface.blur.includes('blur('), 'Recent card must blur the wallpaper behind it');
  assert.equal(mobile.recentsHeader.position, 'static', 'Recent heading must not paint a sticky band');
  assert.equal(mobile.recentsHeader.background, 'rgba(0, 0, 0, 0)', 'Recent heading must not paint its own background');
  assert.equal(mobile.recentsRows[0].background, 'rgba(0, 0, 0, 0)', 'Rows must not be individual cards');
  assert.equal(mobile.recentsRows[1].borderTop, '1px', 'Adjacent rows must be separated by a hairline');
  assert.notEqual(mobile.recentsLinkColor, mobile.bodyColor, 'Row text must contrast with the page background');
  await page.screenshot({ path: shots + '/new-thread-mobile.jpg', type: 'jpeg', quality: 88 });

  const darkPage = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  darkPage.setDefaultTimeout(20000);
  await darkPage.route('**/api/v1/plugins/aura/rpc/get', route => route.fulfill({ json: { ok: true, result: state } }));
  await darkPage.goto(base);
  await darkPage.locator('#root-compose-main-panel .aura-capy-ink[data-half-wallpaper] canvas[data-rendered]').waitFor();
  await darkPage.waitForTimeout(500);
  const dark = await darkPage.evaluate(() => {
    const panel = document.querySelector('#root-compose-main-panel');
    const recents = panel.querySelector('[data-root-compose-mobile-recents]');
    const rows = recents ? [...recents.querySelectorAll("ul > li")] : [];
    const cs = recents ? getComputedStyle(recents) : null;
    return { background: cs?.backgroundColor ?? null, radius: cs?.borderTopLeftRadius ?? null, rows: rows.length, borderTop: rows[1] ? getComputedStyle(rows[1]).borderTopWidth : null, linkColor: rows[0]?.querySelector("a") ? getComputedStyle(rows[0].querySelector("a")).color : null, bodyColor: getComputedStyle(document.body).backgroundColor };
  });
  assert.match(dark.background, /0\.9\d\)/, 'Dark theme must keep the opaque Recent surface');
  assert.ok(dark.rows >= 2, 'Dark theme must render Recent rows');
  assert.equal(dark.borderTop, '1px', 'Dark theme must keep the row divider');
  assert.notEqual(dark.linkColor, dark.bodyColor, 'Dark theme row text must contrast with the page background');
  await darkPage.screenshot({ path: shots + '/new-thread-mobile-dark.jpg', type: 'jpeg', quality: 88 });
  await darkPage.close();

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
  assert.ok(desktop.recentsSurface === null || desktop.recentsSurface.display === 'none', 'Mobile Recent card must stay hidden on desktop');
  assert.ok(['none', 'absent'].includes(desktop.spacerDisplay), 'Desktop composition must hide the compact spacer');
  assert.ok(['none', 'absent'].includes(desktop.fadeDisplay), 'Desktop composition must hide the compact fade');
  assert.ok(desktop.overflow <= 1 && desktop.pageOverflow <= 1, `No horizontal overflow on desktop (panel ${desktop.overflow}, page ${desktop.pageOverflow})`);
  await page.screenshot({ path: shots + '/new-thread-desktop.jpg', type: 'jpeg', quality: 88 });

  console.log('PASS: mobile composer pinned to the bottom with recents scrolling above; desktop composition unchanged.');
} finally {
  await browser.close();
}
