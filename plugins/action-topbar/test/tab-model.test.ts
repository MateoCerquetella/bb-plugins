import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TAB_ID_LENGTH,
  MAX_TAB_LABEL_LENGTH,
  boundedTabId,
  boundedTabLabel,
  buildLauncherOptions,
  displayableTabs,
  nativeLabelMatchesTab,
  parseTabsSnapshot,
  type TabSummary,
} from "../lib/tab-model.ts";

const tabs: TabSummary[] = [
  {
    id: "info",
    kind: "thread-info",
    label: "Info",
    closable: false,
    relaunchActionId: null,
  },
  {
    id: "taskboard",
    kind: "plugin-panel",
    label: "Taskboard",
    closable: true,
    relaunchActionId: "plugin-action:taskboard:taskboard-panel",
  },
  {
    id: "recap",
    kind: "plugin-panel",
    label: "Recap",
    closable: true,
    relaunchActionId: "plugin-action:bb-recap:recap",
  },
];

test("shows only real content tabs in the mirrored strip", () => {
  assert.deepEqual(
    displayableTabs(tabs).map((tab) => tab.id),
    ["taskboard", "recap"],
  );
});

test("keeps the empty combobox action-only and ranks open tabs while searching", () => {
  const actions = [
    { id: "plugin-action:taskboard:taskboard-panel", label: "Taskboard" },
    { id: "plugin-action:bb-recap:recap", label: "Recap" },
  ];
  assert.deepEqual(
    buildLauncherOptions(tabs, actions, "").map((option) => option.kind),
    ["action", "action"],
  );
  assert.deepEqual(
    buildLauncherOptions(tabs, actions, "").map((option) => option.detail),
    ["Drag", "Drag"],
  );
  const results = buildLauncherOptions(tabs, actions, "recap");
  assert.equal(results[0]?.kind, "tab");
  assert.equal(results[0]?.targetId, "recap");
  assert.equal(results[1]?.kind, "action");
});

test("ranks an equivalent open tab before its Action even when titles differ", () => {
  const browserTab: TabSummary = {
    id: "browser",
    kind: "browser",
    label: "example.com",
    closable: true,
    relaunchActionId: "file-search-result-open-browser",
  };
  const results = buildLauncherOptions(
    [browserTab],
    [{ id: "file-search-result-open-browser", label: "Open browser" }],
    "browser",
  );
  assert.equal(results[0]?.kind, "tab");
  assert.equal(results[0]?.targetId, "browser");
  assert.equal(results[1]?.kind, "action");
});

test("never positionally pairs a stale New Tab snapshot with a new Action tab", () => {
  assert.equal(nativeLabelMatchesTab(tabs[0]!, "Taskboard"), false);
  assert.equal(
    nativeLabelMatchesTab(
      {
        id: "new",
        kind: "new-tab",
        label: "New tab",
        closable: true,
        relaunchActionId: null,
      },
      "Taskboard",
    ),
    false,
  );
  assert.equal(
    nativeLabelMatchesTab(
      {
        id: "terminal",
        kind: "terminal",
        label: "Terminal",
        closable: true,
        relaunchActionId: "file-search-result-start-terminal",
      },
      "Terminal 2",
    ),
    true,
  );
});

test("uses one bounded normalization for server and native tab identities", () => {
  const longLabel = `  ${"x".repeat(500)}  `;
  const boundedLabel = boundedTabLabel(longLabel, "Tab");
  assert.equal(boundedLabel.length, MAX_TAB_LABEL_LENGTH);
  assert.equal(
    nativeLabelMatchesTab(
      {
        id: "long",
        kind: "plugin-panel",
        label: boundedLabel,
        closable: true,
        relaunchActionId: "plugin-action:demo:open",
      },
      longLabel,
    ),
    true,
  );
  assert.equal(
    boundedTabId(`native:0:${"y".repeat(1_000)}`, "native:0").length,
    MAX_TAB_ID_LENGTH,
  );
});

test("validates RPC snapshots before the content script renders them", () => {
  assert.deepEqual(parseTabsSnapshot({ revision: 2, tabs }), {
    revision: 2,
    tabs,
  });
  assert.equal(parseTabsSnapshot({ revision: -1, tabs }), null);
  assert.equal(
    parseTabsSnapshot({ revision: 1, tabs: [...tabs, tabs[0]] }),
    null,
  );
  assert.equal(
    parseTabsSnapshot({
      revision: 1,
      tabs: [{ ...tabs[0], id: "x".repeat(513) }],
    }),
    null,
  );
});
