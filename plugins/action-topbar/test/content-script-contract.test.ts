import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/action-topbar.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../app.css", import.meta.url), "utf8");

test("mounts the owned strip in the thread-header center and leaves native plus alone", () => {
  assert.match(source, /root\.dataset\.actionTopbarRoot = ""/);
  assert.match(source, /center\.append\(root\)/);
  assert.doesNotMatch(source, /action-topbar__host-trigger/);
  assert.doesNotMatch(source, /bypassNativeTrigger/);
  assert.match(
    styles,
    /\[data-action-topbar-native-strip\]\s*\{\s*display: none/,
  );
  assert.doesNotMatch(
    styles,
    /thread-secondary-panel-top-chrome[^}]*display:\s*none/,
  );
});

test("keeps Action lookup scoped to BB's native launcher", () => {
  const start = source.indexOf("function actionButton");
  const end = source.indexOf("function abortableDelay", start);
  const actionLookup = source.slice(start, end);
  assert.match(actionLookup, /launcher\.querySelectorAll/);
  assert.doesNotMatch(actionLookup, /document\.getElementById/);
});

test("keeps lifecycle and drag work event-driven and reversible", () => {
  assert.doesNotMatch(source, /setInterval/);
  assert.match(source, /endTopbarDrag\(false\);\s*removeTopbar\(\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /restoreNativeStrips\(\)/);
  assert.match(source, /window\.removeEventListener\("pointermove"/);
});

test("preserves keyboard focus and the bounded cross-pane relaunch path", () => {
  assert.match(source, /closeLauncher\(true\)/);
  assert.match(source, /"ArrowLeft"/);
  assert.match(source, /"ArrowRight"/);
  assert.match(
    source,
    /relaunchTabInPane\(current\.source, current\.targetPane\)/,
  );
  assert.match(source, /BB cannot move this file tab between thread panes/);
});

test("focuses main Action panes without opening the right panel", () => {
  const start = source.indexOf("const activateTab");
  const end = source.indexOf("const closeTab", start);
  const activation = source.slice(start, end);
  assert.ok(
    activation.indexOf("mainActionPane") < activation.indexOf("ensurePanel"),
  );
  assert.match(activation, /mirror\?\.summary\.kind === "terminal"/);
  assert.match(source, /boundedTabId\(`action-pane:\$\{actionId\}`/);
});

test("places close controls on the left and closes through persisted tab state", () => {
  assert.match(styles, /\.action-topbar__tab-close\s*\{[^}]*left: 0\.35rem/s);
  assert.doesNotMatch(styles, /\.action-topbar__tab-close\s*\{[^}]*right:/s);
  assert.match(source, /callRpc<unknown>\(\s*"closeTab"/s);
  assert.match(source, /dataset\.terminalId/);
  assert.match(
    source,
    /wrapper\.append\(close\);[\s\S]*wrapper\.append\(select\)/,
  );
  assert.match(source, /mainWorkspaceMirrors\(currentMirrors, actions\)/);
  assert.match(
    source,
    /setTimeout\([\s\S]*buttonWithAriaPrefix\("Hide right panel"\)\?\.click\(\)[\s\S]*180/,
  );
});

test("makes Actions drag-only instead of opening them from click or Enter", () => {
  assert.match(source, /beginThreadActionSplitDrag/);
  assert.match(source, /tryCapturePointer\(row, pointerId\)/);
  assert.match(source, /tryReleasePointer\(row, pointerId\)/);
  assert.match(source, /option\.kind === "action"\) return/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(
    styles,
    /\[data-action-topbar-action\][^{]*\{[^}]*cursor: grab/s,
  );
});
