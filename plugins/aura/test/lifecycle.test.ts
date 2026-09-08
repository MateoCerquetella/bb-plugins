import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountBackground, notifyChange, TARGETS } from "../lib/background.ts";
import { defaults } from "../lib/model.ts";

test("applies scoped backgrounds, disables cleanly and ignores a late fetch after disposal", async () => {
  const dom = new JSDOM('<html><head></head><body><div id="thread-detail-timeline-panel"></div><div id="root-compose-main-panel"></div><aside>Sidebar</aside></body></html>', { pretendToBeVisual: true });
  const saved = { window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent, fetch: globalThis.fetch, Element: globalThis.Element, HTMLElement: globalThis.HTMLElement, MutationObserver: globalThis.MutationObserver };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  let finish: (response: Response) => void = () => {};
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const controller = new AbortController();
  const dispose = mountBackground(controller.signal);
  try {
    assert.equal(document.querySelectorAll('style[data-aura]').length, 1);
    notifyChange({ settings: defaults, image: null, slots: [], activeSlot: null });
    assert.match(document.head.textContent!, /thread-detail-timeline-panel/);
    assert.ok(document.head.textContent!.includes(TARGETS));
    assert.ok(!document.head.textContent!.includes("aside"));
    assert.equal(document.querySelectorAll('.aura-capy-layer').length, 2);
    notifyChange({ settings: { ...defaults, newThreadOnly: true }, image: null, slots: [], activeSlot: null });
    assert.equal(document.querySelector('#thread-detail-timeline-panel .aura-capy-layer'), null);
    assert.equal(document.querySelectorAll('#root-compose-main-panel .aura-capy-layer').length, 1);
    assert.ok(!document.head.textContent!.includes('thread-detail-timeline-panel'));
    const pane = document.createElement('div'); pane.id = 'thread-detail-timeline-panel'; document.body.append(pane);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(pane.querySelector('.aura-capy-layer'), null);
    notifyChange({ settings: defaults, image: null, slots: [], activeSlot: null });
    assert.equal(document.querySelectorAll('.aura-capy-layer').length, 3);
    const photo = { version: "a".repeat(24), name: "wallpaper.png", mime: "image/png" as const, bytes: 100 };
    notifyChange({ settings: defaults, image: photo, slots: [], activeSlot: null });
    const reused = document.querySelector<HTMLElement>('#root-compose-main-panel')!;
    assert.ok(reused.querySelector('.aura-capy-ink[data-center-dim]'));
    reused.id = 'thread-detail-timeline-panel';
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(reused.querySelector('.aura-capy-ink[data-center-dim]'), null);
    reused.id = 'root-compose-main-panel';
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(reused.querySelector('.aura-capy-ink[data-center-dim]'), 'Reused New thread panels must regain their center dimmer');


    notifyChange({ settings: { ...defaults, enabled: false }, image: null, slots: [], activeSlot: null });
    assert.equal(document.head.textContent, "");
    controller.abort();
    dispose();
    assert.equal(document.querySelectorAll('style[data-aura]').length, 0);
    finish(new Response(JSON.stringify({ ok: true, result: { settings: defaults, image: null, slots: [], activeSlot: null } })));
    await new Promise(resolve => setTimeout(resolve, 0));
    notifyChange({ settings: defaults, image: null, slots: [], activeSlot: null });
    assert.equal(document.querySelectorAll('style[data-aura]').length, 0);
  } finally {
    dispose(); dom.window.close(); Object.assign(globalThis, saved);
  }
});
