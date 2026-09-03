import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.tsx", import.meta.url), "utf8");

test("panel owns constrained-height scrolling", () => {
  const root = styles.match(/\.host-monitor\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(root, /height:\s*100%/);
  assert.match(root, /min-height:\s*0/);
  assert.match(root, /overflow-y:\s*auto/);
  assert.match(root, /overscroll-behavior-y:\s*contain/);
  assert.doesNotMatch(root, /overscroll-behavior:\s*contain/);
  assert.doesNotMatch(styles, /safe-area-inset-bottom/);
});

test("mobile charts preserve vertical touch scrolling", () => {
  const chart = styles.match(/\.host-monitor__chart\s*>\s*div\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(chart, /touch-action:\s*pan-y\s+pinch-zoom/);
});

test("wide process details remain keyboard-scrollable and reflow workload text", () => {
  assert.match(app, /className="host-monitor__processes"[^>]*tabIndex=\{0\}/);
  assert.match(app, /<\/div><p className="host-monitor__processes-note">Top 12/);
  assert.match(styles, /\.host-monitor__processes:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/);
  assert.match(styles, /\.host-monitor__processes \[role="row"\] > span:first-child\s*\{[^}]*white-space:\s*normal/);
});

test("mobile layout keeps summary metrics compact", () => {
  const compact = styles.match(/@container\s*\(max-width:\s*760px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(compact, /\.host-monitor__metrics[^\{]*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(compact, /\.host-monitor__charts\s*\{\s*grid-template-columns:\s*1fr/);
});
