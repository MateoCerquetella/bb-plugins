import assert from "node:assert/strict";
import test from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";

type ThreadRecord = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];
type ProjectRecord = Awaited<
  ReturnType<BbPluginApi["sdk"]["projects"]["list"]>
>[number];

function listThread(
  id: string,
  overrides: Partial<ThreadRecord> = {},
): ThreadRecord {
  return {
    activity: {
      activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0,
      activeGoalCount: 0,
      activePlanModeCount: 0,
      activeWorkflowCount: 0,
    },
    archivedAt: null,
    createdAt: 1,
    deletedAt: null,
    environmentBranchName: null,
    environmentHostId: null,
    environmentId: null,
    environmentName: null,
    environmentWorkspaceDisplayKind: "other",
    hasPendingInteraction: false,
    id,
    lastReadAt: 1,
    latestAttentionAt: 1,
    originKind: null,
    originPluginId: null,
    parentThreadId: null,
    pinSortKey: null,
    pinnedAt: null,
    projectId: "project-1",
    providerId: "codex",
    runtime: { displayStatus: "idle", hostReconnectGraceExpiresAt: null },
    sectionId: null,
    sourceThreadId: null,
    status: "idle",
    title: id,
    titleFallback: null,
    updatedAt: 10,
    visibility: "visible",
    ...overrides,
  };
}

function project(): ProjectRecord {
  return {
    createdAt: 1,
    gitRemoteUrl: null,
    id: "project-1",
    kind: "standard",
    name: "bb-plugins",
    sources: [],
    updatedAt: 1,
  };
}

test("snapshot returns bounded JSON and queries hidden rows explicitly", async (t) => {
  const rows = [
    listThread("active", {
      runtime: { displayStatus: "active", hostReconnectGraceExpiresAt: null },
      status: "active",
      updatedAt: 20,
    }),
    listThread("hidden", { visibility: "hidden" }),
  ];
  const fake = createFakePluginHost({
    pluginId: "touchbar",
    sdk: {
      threads: { list: async () => rows },
      projects: { list: async () => [project()] },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = await fake.harness.behavior.runCli(["snapshot"]);
  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout ?? "") as {
    schemaVersion: number;
    threads: Array<Record<string, unknown>>;
  };
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(parsed.threads.map((row) => row.id), ["active"]);
  assert.deepEqual(Object.keys(parsed.threads[0] ?? {}).sort(), [
    "attention",
    "id",
    "project",
    "providerId",
    "status",
    "title",
    "unread",
    "updatedAtMs",
  ]);
  assert.deepEqual(
    fake.harness.inspection.sdk.callsTo("threads.list")[0],
    [{ archived: false, includeHidden: true, limit: 200 }],
  );
});

test("snapshot includes bounded weekly subscription percentages", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "touchbar",
    sdk: {
      threads: { list: async () => [listThread("active")] },
      projects: { list: async () => [project()] },
      system: {
        usageLimits: async () => ({
          codex: {
            status: "ok" as const,
            accountEmail: null,
            planLabel: "Plus",
            windows: [
              { label: "Five-hour", usedPercent: 10, resetsAt: null },
              { label: "Weekly", usedPercent: 42.4, resetsAt: null },
            ],
          },
          "claude-code": { status: "unauthenticated" as const },
          deepseek: {
            status: "ok" as const,
            accountEmail: null,
            planLabel: "Pro",
            windows: [{ label: "Weekly", usedPercent: 12, resetsAt: null }],
          },
        }),
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = await fake.harness.behavior.runCli(["snapshot"]);
  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout ?? "") as {
    usage: Array<Record<string, unknown>>;
  };
  assert.deepEqual(parsed.usage, [
    {
      id: "codex",
      name: "Codex",
      status: "ok",
      usedPercent: 42.4,
      windowLabel: "Weekly",
    },
    {
      id: "claudeCode",
      name: "Claude Code",
      status: "unauthenticated",
      usedPercent: null,
      windowLabel: null,
    },
    {
      id: "cursor",
      name: "Cursor",
      status: "error",
      usedPercent: null,
      windowLabel: null,
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      status: "ok",
      usedPercent: 12,
      windowLabel: "Weekly",
    },
  ]);
});

test("settings expose hidden-worker privacy and card count", async (t) => {
  const fake = createFakePluginHost({ pluginId: "touchbar" });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);
  assert.deepEqual(fake.harness.inspection.registrations.settingsDescriptors, {
    cardLimit: {
      type: "string",
      label: "Thread cards",
      description: "Number of prioritized thread cards exposed to the Touch Bar (1–24).",
      default: "24",
    },
    includeHidden: {
      type: "boolean",
      label: "Include hidden workers",
      description:
        "Show hidden child and plugin worker threads. Off by default to keep background work private.",
      default: false,
    },
  });
});

test("open resolves and opens exactly one eligible thread", async (t) => {
  const current = makeThreadResponse({ id: "thr-open", status: "idle" });
  const fake = createFakePluginHost({
    pluginId: "touchbar",
    sdk: {
      threads: {
        get: async () => current,
        open: async () => ({ ok: true }) as never,
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const result = await fake.harness.behavior.runCli(["open", "thr-open"]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    fake.harness.inspection.sdk.callsTo("threads.open")[0],
    [{ threadId: "thr-open", file: null }],
  );
});

test("stop rejects idle and unknown threads without mutation", async (t) => {
  let missing = false;
  const fake = createFakePluginHost({
    pluginId: "touchbar",
    sdk: {
      threads: {
        get: async () => {
          if (missing) throw new Error("not found");
          return makeThreadResponse({ id: "thr-idle", status: "idle" });
        },
        stop: async () => ({ ok: true }),
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const idle = await fake.harness.behavior.runCli(["stop", "thr-idle"]);
  assert.equal(idle.exitCode, 1);
  assert.match(idle.stderr ?? "", /active or starting/u);
  missing = true;
  const unknown = await fake.harness.behavior.runCli(["stop", "missing"]);
  assert.equal(unknown.exitCode, 1);
  assert.equal(fake.harness.inspection.sdk.callsTo("threads.stop").length, 0);
});

test("stop mutates exactly one active thread and malformed commands fail", async (t) => {
  const fake = createFakePluginHost({
    pluginId: "touchbar",
    sdk: {
      threads: {
        get: async () => makeThreadResponse({ id: "thr-active", status: "active" }),
        stop: async () => ({ ok: true }),
      },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const stopped = await fake.harness.behavior.runCli(["stop", "thr-active"]);
  assert.equal(stopped.exitCode, 0);
  assert.deepEqual(
    fake.harness.inspection.sdk.callsTo("threads.stop")[0],
    [{ threadId: "thr-active" }],
  );
  const malformed = await fake.harness.behavior.runCli(["wat"]);
  assert.equal(malformed.exitCode, 1);
  assert.match(malformed.stderr ?? "", /^Usage:/u);
});

test("card and open-card share the same deterministic current slot", async (t) => {
  const row = listThread("thr-card", {
    runtime: { displayStatus: "active", hostReconnectGraceExpiresAt: null },
    status: "active",
    title: "Build the monitor",
  });
  const fake = createFakePluginHost({
    pluginId: "touchbar",
    sdk: {
      threads: {
        list: async () => [row],
        get: async () => makeThreadResponse({ id: "thr-card", status: "active" }),
        open: async () => ({ ok: true }) as never,
      },
      projects: { list: async () => [project()] },
    },
  });
  t.after(() => fake.harness.lifecycle.dispose());
  await plugin(fake.bb);

  const card = await fake.harness.behavior.runCli(["card", "0"]);
  assert.equal(card.stdout, "● Build the monitor · bb-plugins");
  const open = await fake.harness.behavior.runCli(["open-card", "0"]);
  assert.equal(open.exitCode, 0);
  assert.deepEqual(
    fake.harness.inspection.sdk.callsTo("threads.open").at(-1),
    [{ threadId: "thr-card", file: null }],
  );
});
