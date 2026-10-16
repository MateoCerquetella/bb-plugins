import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PluginSidebarProject, PluginSidebarThread } from "@get-bb/plugin-sdk";
import { groupThreadsByProject } from "../lib/inbox.ts";
import { DAY_MS } from "../lib/thread-management.ts";
import { groupFamiliesByStatus } from "../lib/status-groups.ts";
import { groupSidebarFamilies } from "../lib/sidebar-sections.ts";

function thread(overrides: Partial<PluginSidebarThread>): PluginSidebarThread {
  return {
    id: "thread",
    projectId: "project",
    title: "Thread",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1,
    updatedAt: 1,
    lastReadAt: 1,
    latestAttentionAt: 1,
    ...overrides,
  };
}

const projects: PluginSidebarProject[] = [
  { id: "project", name: "Project", isPersonal: false },
];

describe("groupFamiliesByStatus", () => {
  it("orders semantic sections, omits empty sections, and includes each family once", () => {
    const now = 10 * DAY_MS;
    const families = groupThreadsByProject(
      [
        thread({ id: "inactive", updatedAt: now }),
        thread({ id: "working", indicator: "runtime", updatedAt: now }),
        thread({ id: "needs", hasPendingInteraction: true, updatedAt: now }),
        thread({ id: "stale", updatedAt: now - 7 * DAY_MS }),
        thread({ id: "pinned", isPinned: true, indicator: "runtime", updatedAt: now }),
        thread({ id: "failed", indicator: "unread-error", updatedAt: now }),
        thread({ id: "unread", isUnread: true, updatedAt: now }),
      ],
      projects,
    )[0]!.families;

    const groups = groupFamiliesByStatus(families, now);
    assert.deepEqual(groups.map((group) => group.kind), [
      "pinned",
      "needs-you",
      "failed",
      "working",
      "unread",
      "idle",
    ]);
    assert.deepEqual(
      groups.flatMap((group) => group.families.map((family) => family.root.id)),
      ["pinned", "needs", "failed", "working", "unread", "inactive", "stale"],
    );
    assert.deepEqual(groups.map((group) => group.label), [
      "Pinned", "Needs your input", "Failed", "Working", "Unread", "Idle",
    ]);
  });

  it("keeps a child with its root and uses child attention for status", () => {
    const families = groupThreadsByProject([
      thread({ id: "root" }),
      thread({ id: "child", parentThreadId: "root", hasPendingInteraction: true }),
    ], projects)[0]!.families;
    const groups = groupFamiliesByStatus(families, DAY_MS);
    assert.deepEqual(groups.map((group) => group.kind), ["needs-you"]);
    assert.equal(groups[0]?.families[0]?.children[0]?.id, "child");
    assert.deepEqual(groupFamiliesByStatus([], DAY_MS), []);
  });

  it("sorts Updated globally by latest family activity, with pins first", () => {
    const families = groupThreadsByProject([
      thread({ id: "pinned", isPinned: true }),
      thread({ id: "older", updatedAt: 10 }),
      thread({ id: "newer", updatedAt: 20 }),
      thread({ id: "child", parentThreadId: "older", updatedAt: 30 }),
    ], projects)[0]!.families;
    const groups = groupSidebarFamilies(families, "updated");
    assert.deepEqual(groups.map((group) => group.label), ["Pinned", "Updated"]);
    assert.deepEqual(groups.flatMap((group) => group.families.map((family) => family.root.id)),
      ["pinned", "older", "newer"]);
  });

  it("groups environments by identity and machine, not project selection", () => {
    const environment = { id: "env", name: "main", branchName: "main", workspaceDisplayKind: null };
    const families = [
      { root: thread({ id: "mac", environment: { ...environment, workspaceDisplayKind: "managed-worktree" }, host: { id: "mac", name: "Mac" } }), children: [] },
      { root: thread({ id: "mac2", environment: { ...environment, workspaceDisplayKind: "managed-worktree" }, host: { id: "mac", name: "Mac" } }), children: [] },
      { root: thread({ id: "jupiter", environment: { ...environment, workspaceDisplayKind: "managed-worktree" }, host: { id: "jupiter", name: "Jupiter" } }), children: [] },
      { root: thread({ id: "none" }), children: [] },
    ];
    const groups = groupSidebarFamilies(families, "environment");
    assert.deepEqual(groups.map((group) => group.label), ["main · Mac", "main · Jupiter", "No environment"]);
    assert.deepEqual(groups.map((group) => group.families.map((family) => family.root.id)), [["mac", "mac2"], ["jupiter"], ["none"]]);
    assert.deepEqual(groupSidebarFamilies([], "environment"), []);
  });
});
