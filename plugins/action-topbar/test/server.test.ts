import assert from "node:assert/strict";
import test from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";

type ThreadTabsResult = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["tabs"]["get"]>
>;

test("projects BB tab state into the compact frontend RPC model", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "action-topbar",
    sdk: {
      threads: {
        tabs: {
          async get() {
            return {
              revision: 7,
              tabs: [
                { id: "info", kind: "thread-info" as const },
                {
                  id: "taskboard",
                  kind: "plugin-panel" as const,
                  pluginId: "taskboard",
                  actionId: "taskboard-panel",
                  title: "Taskboard",
                  paramsJson: null,
                },
                {
                  id: "terminal",
                  kind: "terminal" as const,
                  terminalId: "term_1",
                },
              ],
            };
          },
        },
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = await fake.harness.behavior.callRpc("listTabs", {
    threadId: "thr_1",
  });

  assert.deepEqual(result, {
    revision: 7,
    tabs: [
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
        id: "terminal",
        kind: "terminal",
        label: "Terminal",
        closable: true,
        relaunchActionId: "file-search-result-start-terminal",
      },
    ],
  });
  assert.deepEqual(fake.harness.inspection.sdk.callsTo("threads.tabs.get"), [
    [{ threadId: "thr_1" }],
  ]);
});

test("persists a topbar drag reorder through BB's tab revision API", async (t) => {
  let state: ThreadTabsResult = {
    revision: 4,
    tabs: [
      { id: "info", kind: "thread-info" },
      {
        id: "taskboard",
        kind: "plugin-panel",
        pluginId: "taskboard",
        actionId: "taskboard-panel",
        title: "Taskboard",
        paramsJson: null,
      },
      {
        id: "recap",
        kind: "plugin-panel",
        pluginId: "bb-recap",
        actionId: "recap",
        title: "Recap",
        paramsJson: null,
      },
    ],
  };
  const fake = createFakePluginHost({
    pluginId: "action-topbar",
    sdk: {
      threads: {
        tabs: {
          async get() {
            return state;
          },
          async update({ expectedRevision, tabs }) {
            assert.equal(expectedRevision, state.revision);
            state = { revision: state.revision + 1, tabs };
            return state;
          },
        },
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = (await fake.harness.behavior.callRpc("reorderTabs", {
    activeTabId: "recap",
    overTabId: "taskboard",
    threadId: "thr_1",
  })) as { revision: number; tabs: Array<{ id: string }> };

  assert.equal(result.revision, 5);
  assert.deepEqual(
    result.tabs.map((tab) => tab.id),
    ["info", "recap", "taskboard"],
  );
  assert.deepEqual(fake.harness.inspection.sdk.callsTo("threads.tabs.update"), [
    [
      {
        expectedRevision: 4,
        tabs: state.tabs,
        threadId: "thr_1",
      },
    ],
  ]);
});

test("closes a topbar tab through BB's tab revision API", async (t) => {
  let state: ThreadTabsResult = {
    revision: 8,
    tabs: [
      { id: "info", kind: "thread-info" },
      {
        id: "terminal",
        kind: "terminal",
        terminalId: "term_1",
      },
    ],
  };
  const fake = createFakePluginHost({
    pluginId: "action-topbar",
    sdk: {
      terminals: {
        async close({ terminalId }) {
          return {
            id: terminalId,
            scope: { kind: "thread" as const, threadId: "thr_1" },
            status: "exited" as const,
            title: "Terminal",
          };
        },
      },
      threads: {
        tabs: {
          async get() {
            return state;
          },
          async update({ expectedRevision, tabs }) {
            assert.equal(expectedRevision, state.revision);
            state = { revision: state.revision + 1, tabs };
            return state;
          },
        },
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = (await fake.harness.behavior.callRpc("closeTab", {
    tabId: "terminal",
    threadId: "thr_1",
  })) as { revision: number; tabs: Array<{ id: string }> };

  assert.equal(result.revision, 9);
  assert.deepEqual(
    result.tabs.map((tab) => tab.id),
    ["info"],
  );
  assert.deepEqual(fake.harness.inspection.sdk.callsTo("terminals.close"), [
    [{ mode: "force", terminalId: "term_1" }],
  ]);
  assert.deepEqual(fake.harness.inspection.sdk.callsTo("threads.tabs.update"), [
    [
      {
        expectedRevision: 8,
        tabs: state.tabs,
        threadId: "thr_1",
      },
    ],
  ]);
});

test("closes a main-pane terminal without a persisted panel tab", async (t) => {
  const state: ThreadTabsResult = {
    revision: 10,
    tabs: [{ id: "info", kind: "thread-info" }],
  };
  const fake = createFakePluginHost({
    pluginId: "action-topbar",
    sdk: {
      terminals: {
        async close({ terminalId }) {
          return {
            id: terminalId,
            scope: { kind: "thread" as const, threadId: "thr_1" },
            status: "exited" as const,
            title: "Terminal",
          };
        },
      },
      threads: {
        tabs: {
          async get() {
            return state;
          },
        },
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = (await fake.harness.behavior.callRpc("closeTab", {
    tabId: "action-pane:file-search-result-start-terminal",
    terminalId: "term_main",
    threadId: "thr_1",
  })) as { revision: number; tabs: Array<{ id: string }> };

  assert.equal(result.revision, 10);
  assert.deepEqual(
    result.tabs.map((tab) => tab.id),
    ["info"],
  );
  assert.deepEqual(fake.harness.inspection.sdk.callsTo("terminals.close"), [
    [{ mode: "force", terminalId: "term_main" }],
  ]);
});

test("bounds host-provided tab labels before returning the RPC projection", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "action-topbar",
    sdk: {
      threads: {
        tabs: {
          async get() {
            return {
              revision: 1,
              tabs: [
                {
                  id: "browser",
                  kind: "browser" as const,
                  environmentId: null,
                  title: "x".repeat(500),
                  url: "https://example.com",
                },
              ],
            };
          },
        },
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = (await fake.harness.behavior.callRpc("listTabs", {
    threadId: "thr_1",
  })) as { tabs: Array<{ label: string }> };

  assert.equal(result.tabs[0]?.label.length, 160);
});
