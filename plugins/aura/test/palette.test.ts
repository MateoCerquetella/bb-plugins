import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountDevicePalette, PALETTE_KEY, writeDevicePalette } from "../lib/palette.ts";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("overrides BB's palette on this device only, follows BB edits back, and restores on reset", async () => {
  const dom = new JSDOM('<html><head><style id="bb-app-theme">/* mars */</style></head><body></body></html>', { url: "http://bb.test/" });
  const keys = ["window", "document", "HTMLStyleElement", "MutationObserver", "localStorage", "fetch", "dispatchEvent"] as const;
  const saved = Object.fromEntries(keys.map(k => [k, (globalThis as any)[k]]));
  const requested: string[] = [];
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLStyleElement: dom.window.HTMLStyleElement,
    MutationObserver: dom.window.MutationObserver, localStorage: dom.window.localStorage,
    dispatchEvent: (event: Event) => dom.window.dispatchEvent(new dom.window.Event(event.type)),
    fetch: async (url: string) => { requested.push(url); return new Response(JSON.stringify({ customCss: "/* glass */" })); },
  });
  const style = () => dom.window.document.getElementById("bb-app-theme")!;
  const controller = new AbortController();
  try {
    mountDevicePalette(controller.signal);
    await tick();
    assert.equal(style().textContent, "/* mars */", "no device choice keeps BB's palette");

    writeDevicePalette("default"); await tick();
    assert.equal(style().textContent, "", "BB default clears the shared palette CSS");
    assert.equal(dom.window.localStorage.getItem(PALETTE_KEY), "default");

    writeDevicePalette("plugin:theme-glass:glass"); await tick(); await tick();
    assert.equal(style().textContent, "/* glass */");
    writeDevicePalette(null); await tick();
    assert.equal(style().textContent, "/* mars */", "switching default → glass → shared restores BB's palette, not an earlier override");
    writeDevicePalette("plugin:theme-glass:glass"); await tick(); await tick();
    assert.equal(style().textContent, "/* glass */");
    assert.equal(requested[0], "/api/v1/settings/themes/plugin%3Atheme-glass%3Aglass");

    style().textContent = "/* nord */"; await tick();
    assert.equal(style().textContent, "/* glass */", "BB rewriting the shared palette is overridden on this device");

    writeDevicePalette(null); await tick();
    assert.equal(style().textContent, "/* nord */", "back to the latest shared palette");
  } finally {
    controller.abort();
    Object.assign(globalThis, saved);
  }
});
