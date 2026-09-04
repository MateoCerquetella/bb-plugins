import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.tsx", import.meta.url), "utf8");

test("page owns constrained-height vertical scrolling", () => {
  const root = styles.match(/\.host-monitor\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(root, /height:\s*100%/u);
  assert.match(root, /min-height:\s*0/u);
  assert.match(root, /overflow-y:\s*auto/u);
  assert.match(root, /overscroll-behavior-y:\s*contain/u);
});

test("fleet is searchable, bounded, and selected by cards", () => {
  assert.match(app, /placeholder="Name, id, or platform"/u);
  assert.match(app, /setSelectedHostId\(machine\.host\.id\)/u);
  assert.match(styles, /\.host-monitor__machine-grid\s*\{[^}]*max-height:/su);
  assert.match(styles, /\.host-monitor__machine-grid\s*\{[^}]*overflow-y:\s*auto/su);
});

test("390px layout stacks controls, stats, facts, and keeps chart height", () => {
  const compact = styles.match(/@container\s*\(max-width:\s*390px\)\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
  assert.match(compact, /\.host-monitor__panel-grid[\s\S]*grid-template-columns:\s*1fr/u);
  assert.match(compact, /\.host-monitor__facts[\s\S]*grid-template-columns:\s*1fr/u);
  assert.match(compact, /\.host-monitor__chart[\s\S]*grid-column:\s*auto/u);
  assert.match(compact, /\.host-monitor__chart\s*>\s*div[\s\S]*min-height:\s*210px/u);
  assert.match(styles, /@container\s*\(max-width:\s*460px\)[\s\S]*\.host-monitor__toolbar\s*\{\s*grid-template-columns:\s*1fr/u);
  assert.match(styles, /@container\s*\(max-width:\s*460px\)[\s\S]*\.host-monitor__editor-list\s*>\s*li\s*\{\s*grid-template-columns:\s*1fr/u);
});

test("charts preserve page scrolling and expose textual summaries", () => {
  assert.match(styles, /\.host-monitor__chart\s*>\s*div\s*\{[^}]*touch-action:\s*pan-y\s+pinch-zoom/su);
  assert.match(app, /<dt>Latest<\/dt>/u);
  assert.match(app, /<dt>Min<\/dt>/u);
  assert.match(app, /<dt>Max<\/dt>/u);
  assert.match(app, /history\.rangeHours === rangeHours/u);
  assert.match(app, /void loadHistory\(\)/u);
});
