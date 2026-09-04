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

test("fleet is searchable, selected by cards, and protects dirty drafts", () => {
  assert.match(app, /placeholder="Name, id, or platform"/u);
  assert.match(app, /setSelectedHostId\(machine\.host\.id\)/u);
  assert.match(app, /dirtyDashboard/u);
  assert.match(app, /beforeunload/u);
  assert.match(app, /Save or cancel dashboard changes before switching hosts/u);
});

test("history uses the optimized BB-style combobox instead of a native select", () => {
  assert.match(app, /<HistoryRangeSelect/u);
  assert.match(app, /<SelectTrigger aria-labelledby="host-monitor-history-label">/u);
  assert.match(app, /<SelectContent align="end">/u);
  assert.match(app, /const RANGE_OPTIONS: ReadonlyArray/u);
  assert.doesNotMatch(app, /<select/u);
  assert.match(styles, /\.bb-select__content\s*\{[^}]*min-width:\s*var\(--radix-select-trigger-width\)/su);
  assert.match(styles, /\.bb-select__item\[data-highlighted\]/u);
  assert.match(styles, /\.bb-select__item\[data-state="checked"\]/u);
});

test("narrow layout uses a snap host strip, one widget column, and compact processes", () => {
  assert.match(styles, /@container\s*\(max-width:\s*560px\)[\s\S]*\.host-monitor__machine-grid\s*\{[^}]*overflow-x:\s*auto[^}]*scroll-snap-type:\s*x\s+mandatory/su);
  assert.match(styles, /@container\s*\(max-width:\s*560px\)[\s\S]*\.host-monitor__panel-grid\s*\{[^}]*grid-template-columns:\s*1fr/su);
  assert.match(styles, /@container\s*\(max-width:\s*560px\)[\s\S]*\.host-monitor__process-table-wrap\s*\{[^}]*display:\s*none/su);
  assert.match(styles, /@container\s*\(max-width:\s*560px\)[\s\S]*\.host-monitor__process-list\s*\{[^}]*display:\s*grid/su);
  assert.match(styles, /\.host-monitor__dialog\s*\{[^}]*max-height:\s*min\(680px,\s*calc\(100dvh\s*-\s*24px\)\)/su);
});

test("widget editor exposes pointer and keyboard-accessible reorder paths", () => {
  assert.match(app, /draggable/u);
  assert.match(app, /onDragStart/u);
  assert.match(app, /onDrop/u);
  assert.match(app, /Move .* earlier/u);
  assert.match(app, /Move .* later/u);
  assert.match(app, /moved to position/u);
  assert.match(app, /Reset draft/u);
  assert.match(app, /Save layout/u);
});

test("live dashboard widgets are draggable in customization mode", () => {
  assert.match(app, /className="host-monitor__grid-item"/u);
  assert.match(app, /draggable=\{editing\}/u);
  assert.match(app, /moveDashboardWidget\(source, key, position\)/u);
  assert.match(app, /dashboardPointerDropPosition/u);
  assert.match(app, /setDashboardDragPreview/u);
  assert.match(app, /onDragLeave/u);
  assert.match(app, /draggedWidgetKey === key[\s\S]*setDashboardDropTarget\(null\)/u);
  assert.match(app, /className="host-monitor__widget-drag-handle"/u);
  assert.match(styles, /\.host-monitor__panel-grid\[data-editing="true"\]\s+\.host-monitor__grid-item/u);
  assert.match(styles, /\.host-monitor__grid-item\[data-dragging="true"\]/u);
  assert.match(styles, /\.host-monitor__grid-item\[data-drop-position="before"\]::after/u);
  assert.match(styles, /\.host-monitor__grid-item\[data-drop-position="after"\]::after/u);
});

test("typography and restrained accents use BB theme conventions", () => {
  assert.match(styles, /font-family:\s*"Inter Variable",\s*Inter,\s*sans-serif/u);
  assert.match(styles, /--host-monitor-widget-accent:\s*var\(--muted-foreground\)/u);
  assert.match(styles, /data-accent="cpu"[\s\S]*var\(--primary\)/u);
  assert.match(styles, /data-accent="memory"[\s\S]*var\(--success\)/u);
  assert.match(styles, /data-accent="disk"[\s\S]*var\(--warning\)/u);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/iu);
});

test("process widget is selected-host scoped and uses explicit confirmation", () => {
  assert.match(app, /machine\.host\.id/u);
  assert.match(app, /machine\.host\.status !== "connected"/u);
  assert.match(app, /prepareProcessTermination/u);
  assert.match(app, /executeProcessTermination/u);
  assert.match(app, /Terminate process\?/u);
  assert.match(app, /Force terminate process\?/u);
  assert.match(app, /hostGeneration/u);
  assert.match(app, /listRequest/u);
  assert.doesNotMatch(app, /const generation = \+\+requestGeneration/u);
});

test("process section toggles compactly and pauses polling while collapsed", () => {
  assert.match(app, /const \[expanded, setExpanded\] = useState\(true\)/u);
  assert.match(app, /data-expanded=\{expanded\}/u);
  assert.match(app, /aria-expanded=\{expanded\}/u);
  assert.match(app, /aria-controls="host-monitor-process-content"/u);
  assert.match(app, /id="host-monitor-process-content"/u);
  assert.match(app, /expanded \? "Collapse" : "Expand"/u);
  assert.match(app, /if \(!expanded \|\| machine\.host\.status !== "connected"\) return/u);
  assert.match(app, /!expanded \? \([\s\S]*?<ProcessSummaryStrip/u);
  assert.match(app, /processPanelState/u);
  assert.match(app, /Top CPU shown/u);
  assert.match(app, /Top RAM shown/u);
  assert.match(app, /Protected shown/u);
  assert.match(app, /data-refresh-count=\{refreshCount\}/u);
  assert.match(app, /const processFooterMessage = !expanded/u);
  assert.match(styles, /\.host-monitor__process-summary\s*\{[^}]*display:\s*flex/su);
  assert.match(styles, /\.host-monitor__process-summary\s*>\s*div\s*\{[^}]*background:\s*transparent/su);
  assert.match(styles, /\.host-monitor__process-table-wrap\s*\{[^}]*border:\s*0/su);
  assert.match(styles, /\.host-monitor__process-state\[data-state="success"\]/u);
  assert.match(styles, /\.host-monitor__process-protection/u);
});

test("process polling cannot invalidate a pending destructive action", () => {
  const listStart = app.indexOf("const loadProcesses = useCallback");
  const listEnd = app.indexOf("useEffect(() =>", listStart);
  const listBody = app.slice(listStart, listEnd);
  assert.match(listBody, /const generation = hostGeneration\.current/u);
  assert.match(listBody, /const request = \+\+listRequest\.current/u);
  assert.doesNotMatch(listBody, /hostGeneration\.current\s*[+]=|\+\+hostGeneration\.current/u);

  const actionStart = app.indexOf("const executeTermination = useCallback");
  const actionEnd = app.indexOf("const ok =", actionStart);
  const actionBody = app.slice(actionStart, actionEnd);
  assert.match(actionBody, /const generation = hostGeneration\.current/u);
  assert.match(actionBody, /setExecuting\(false\)/u);
  assert.doesNotMatch(actionBody, /listRequest/u);
});

test("charts preserve page scrolling and expose textual summaries", () => {
  assert.match(styles, /\.host-monitor__chart\s*>\s*div\s*\{[^}]*touch-action:\s*pan-y\s+pinch-zoom/su);
  assert.match(app, /<dt>Latest<\/dt>/u);
  assert.match(app, /<dt>Min<\/dt>/u);
  assert.match(app, /<dt>Max<\/dt>/u);
  assert.match(app, /history\.rangeHours === rangeHours/u);
  assert.match(app, /void loadHistory\(\)/u);
});
