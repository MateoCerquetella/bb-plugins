import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/sidebar-strip.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

test("keeps Grok and OpenCode independently configurable", () => {
  assert.match(server, /enableGrok:\s*\{/u);
  assert.match(server, /label: "Enable Grok"/u);
  assert.match(server, /enableOpenCode:\s*\{/u);
  assert.match(server, /label: "Enable OpenCode"/u);
});

test("emits semantic severity for compact, rail, and detail presentation", () => {
  assert.match(source, /button\.dataset\.level = usageLevel/u);
  assert.match(source, /rail\.dataset\.level = usageLevel/u);
  assert.match(source, /row\.dataset\.level = usageLevel/u);
  assert.match(styles, /--usage-sidebar-warning:/u);
  assert.match(styles, /--usage-sidebar-critical:/u);
  assert.match(styles, /data-level="warning"/u);
  assert.match(styles, /data-level="critical"/u);
});

test("summarizes larger provider sets and exposes the complete overview", () => {
  assert.match(source, /items\.length > 2/u);
  assert.match(source, /highestSidebarUsagePrimary\(items\)/u);
  assert.match(source, /`\+\$\{additionalCount\}`/u);
  assert.match(source, /Agent usage overview/u);
  assert.match(source, /usage-tracker-sidebar__overview-provider/u);
  assert.match(styles, /\.usage-tracker-sidebar__summary/u);
  assert.match(styles, /\.usage-tracker-sidebar__overview-list/u);
  assert.match(styles, /\.usage-tracker-sidebar__overview-provider/u);
});

test("preserves provider-specific details and focus restoration", () => {
  assert.match(source, /detailsId\(providerId\)/u);
  assert.match(source, /requestedFocus = isClosing/u);
  assert.match(source, /providerGlyph\(providerId\)/u);
  assert.match(source, /provider\.id === "codex"/u);
  assert.match(source, /isOverviewOpen = false/u);
  assert.match(source, /requestedFocus = \{ kind: "summary" \}/u);
});
