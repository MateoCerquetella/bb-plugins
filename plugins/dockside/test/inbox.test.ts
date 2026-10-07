import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@bb/plugin-sdk";
import {
  childrenOf,
  filterByProject,
  groupThreadsByProject,
  hideChildrenOfVisibleParents,
  parentOf,
  partitionPinned,
  searchProjectThreadGroups,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  threadDisplayTitle,
  threadIsWorking,
  visibleInboxThreads,
} from "../lib/inbox.ts";

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

function project(
  id: string,
  name: string,
  isPersonal = false,
): PluginSidebarProject {
  return { id, name, isPersonal };
}

describe("sortByCreatedAtDescending", () => {
  it("puts the newest thread first", () => {
    const ordered = sortByCreatedAtDescending([
      thread({ id: "a", createdAt: 1 }),
      thread({ id: "b", createdAt: 3 }),
      thread({ id: "c", createdAt: 2 }),
    ]);
    assert.deepEqual(
      ordered.map((t) => t.id),
      ["b", "c", "a"],
    );
  });

  // The whole premise: activity must never move a row. Only createdAt is read,
  // so a thread that just did work keeps its place.
  it("ignores activity and update time", () => {
    const before = [
      thread({ id: "a", createdAt: 2, updatedAt: 1 }),
      thread({ id: "b", createdAt: 1, updatedAt: 999, indicator: "runtime" }),
    ];
    assert.deepEqual(
      sortByCreatedAtDescending(before).map((t) => t.id),
      ["a", "b"],
    );
  });

  it("breaks ties on id so the order is stable", () => {
    const ordered = sortByCreatedAtDescending([
      thread({ id: "b", createdAt: 5 }),
      thread({ id: "a", createdAt: 5 }),
    ]);
    assert.deepEqual(
      ordered.map((t) => t.id),
      ["a", "b"],
    );
  });

  it("does not mutate its input", () => {
    const input = [
      thread({ id: "a", createdAt: 1 }),
      thread({ id: "b", createdAt: 2 }),
    ];
    sortByCreatedAtDescending(input);
    assert.deepEqual(
      input.map((t) => t.id),
      ["a", "b"],
    );
  });
});

describe("threadDisplayTitle", () => {
  it("prefers the title, then the fallback, then a placeholder", () => {
    assert.equal(threadDisplayTitle(thread({ title: "Real" })), "Real");
    assert.equal(
      threadDisplayTitle(thread({ title: null, titleFallback: "Fallback" })),
      "Fallback",
    );
    assert.equal(
      threadDisplayTitle(thread({ title: null, titleFallback: null })),
      "Untitled thread",
    );
  });

  it("treats a whitespace-only title as absent", () => {
    assert.equal(
      threadDisplayTitle(thread({ title: "   ", titleFallback: "Fallback" })),
      "Fallback",
    );
  });
});

describe("searchThreadsByTitle", () => {
  it("matches case-insensitively on the visible title", () => {
    const threads = [
      thread({ id: "a", title: "Sidebar work" }),
      thread({ id: "b", title: "Something else" }),
      thread({ id: "c", title: null, titleFallback: "sidebar fallback" }),
    ];
    assert.deepEqual(
      searchThreadsByTitle(threads, "SIDEBAR").map((t) => t.id),
      ["a", "c"],
    );
  });

  it("returns everything for a blank query", () => {
    const threads = [thread({ id: "a" }), thread({ id: "b" })];
    assert.equal(searchThreadsByTitle(threads, "   ").length, 2);
  });
});

describe("filtering", () => {
  it("scopes to one project, or to all", () => {
    const threads = [
      thread({ id: "a", projectId: "p1" }),
      thread({ id: "b", projectId: "p2" }),
    ];
    assert.deepEqual(
      filterByProject(threads, "p1").map((t) => t.id),
      ["a"],
    );
    assert.equal(filterByProject(threads, null).length, 2);
  });

  it("drops archived threads", () => {
    const threads = [
      thread({ id: "a" }),
      thread({ id: "b", isArchived: true }),
    ];
    assert.deepEqual(
      visibleInboxThreads(threads, new Set()).map((t) => t.id),
      ["a"],
    );
  });

  // Settling archives the thread in bb, so the archive flag alone would empty
  // the settled shelf the moment anything landed on it.
  it("keeps an archived thread the plugin parked", () => {
    const threads = [
      thread({ id: "a", isArchived: true }),
      thread({ id: "b", isArchived: true }),
    ];
    assert.deepEqual(
      visibleInboxThreads(threads, new Set(["a"])).map((t) => t.id),
      ["a"],
    );
  });

  it("splits pinned from the rest, keeping order", () => {
    const { pinned, inbox } = partitionPinned([
      thread({ id: "a" }),
      thread({ id: "b", isPinned: true }),
      thread({ id: "c" }),
    ]);
    assert.deepEqual(
      pinned.map((t) => t.id),
      ["b"],
    );
    assert.deepEqual(
      inbox.map((t) => t.id),
      ["a", "c"],
    );
  });
});

describe("project thread groups", () => {
  it("keeps bb's project order, pins roots within a project, and flattens descendants", () => {
    const groups = groupThreadsByProject(
      [
        thread({ id: "root", projectId: "p1", createdAt: 10 }),
        thread({
          id: "child",
          projectId: "p1",
          parentThreadId: "root",
          createdAt: 20,
        }),
        thread({
          id: "grandchild",
          projectId: "p1",
          parentThreadId: "child",
          createdAt: 30,
        }),
        thread({
          id: "pinned",
          projectId: "p1",
          isPinned: true,
          createdAt: 5,
        }),
        thread({ id: "other", projectId: "p2", createdAt: 40 }),
      ],
      [project("p2", "Second"), project("p1", "First")],
    );

    assert.deepEqual(
      groups.map((group) => group.project.id),
      ["p2", "p1"],
    );
    assert.deepEqual(
      groups[1]?.families.map((family) => family.root.id),
      ["pinned", "root"],
    );
    assert.deepEqual(
      groups[1]?.families[1]?.children.map((child) => child.id),
      ["child", "grandchild"],
    );
  });

  it("promotes a child when its parent is not visible", () => {
    const groups = groupThreadsByProject(
      [thread({ id: "child", parentThreadId: "parked" })],
      [project("proj_1", "Project")],
    );
    assert.equal(groups[0]?.families[0]?.root.id, "child");
  });

  it("keeps a parent as context when only its child matches search", () => {
    const groups = groupThreadsByProject(
      [
        thread({ id: "root", title: "Parent" }),
        thread({
          id: "match",
          title: "Fix checkout",
          parentThreadId: "root",
        }),
        thread({
          id: "other",
          title: "Review taxes",
          parentThreadId: "root",
        }),
      ],
      [project("proj_1", "Storefront")],
    );
    const result = searchProjectThreadGroups(groups, "checkout");
    assert.equal(result[0]?.families[0]?.root.id, "root");
    assert.deepEqual(
      result[0]?.families[0]?.children.map((child) => child.id),
      ["match"],
    );
  });

  it("matches a project name and keeps the whole project", () => {
    const groups = groupThreadsByProject(
      [thread({ id: "root" })],
      [project("proj_1", "Storefront")],
    );
    assert.equal(searchProjectThreadGroups(groups, "store").length, 1);
  });

  it("preserves matching empty project launchers in search", () => {
    const groups = [
      { project: project("empty", "Empty Storefront"), families: [] },
      { project: project("other", "Other"), families: [] },
    ];
    assert.deepEqual(searchProjectThreadGroups(groups, " STORE "), [groups[0]]);
    assert.deepEqual(searchProjectThreadGroups(groups, "missing"), []);
    assert.deepEqual(searchProjectThreadGroups(groups, "   "), groups);
  });
});

describe("threadIsWorking", () => {
  it("includes activity counts and resolved runtime states", () => {
    assert.equal(
      threadIsWorking(
        thread({ activity: { workflows: 0, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 } }),
      ),
      true,
    );
    assert.equal(threadIsWorking(thread({ indicator: "runtime" })), true);
    assert.equal(threadIsWorking(thread()), false);
  });
});

describe("child threads", () => {
  it("hides a child whose parent is on screen", () => {
    const visible = hideChildrenOfVisibleParents([
      thread({ id: "parent" }),
      thread({ id: "child", parentThreadId: "parent" }),
    ]);
    assert.deepEqual(
      visible.map((t) => t.id),
      ["parent"],
    );
  });

  // An orphan must stay visible: hidden here AND absent from any header chip
  // would make it unreachable everywhere.
  it("keeps a child whose parent is not on screen", () => {
    const visible = hideChildrenOfVisibleParents([
      thread({ id: "child", parentThreadId: "archived-parent" }),
    ]);
    assert.deepEqual(
      visible.map((t) => t.id),
      ["child"],
    );
  });

  it("lists a thread's children oldest first", () => {
    const children = childrenOf(
      [
        thread({ id: "parent" }),
        thread({ id: "b", parentThreadId: "parent", createdAt: 20 }),
        thread({ id: "a", parentThreadId: "parent", createdAt: 10 }),
        thread({ id: "other", parentThreadId: "elsewhere" }),
      ],
      "parent",
    );
    assert.deepEqual(
      children.map((t) => t.id),
      ["a", "b"],
    );
  });
});

describe("parentOf", () => {
  // The list hides an archived parent, but the child's header must still get
  // it back — otherwise the child is a dead end.
  it("finds a parent the inbox filters out", () => {
    const parent = parentOf(
      [
        thread({ id: "parent", isArchived: true, projectId: "other" }),
        thread({ id: "child", parentThreadId: "parent" }),
      ],
      "child",
    );
    assert.equal(parent?.id, "parent");
  });

  it("returns null for a root thread", () => {
    assert.equal(parentOf([thread({ id: "root" })], "root"), null);
  });

  it("returns null when the parent row is gone", () => {
    const threads = [thread({ id: "child", parentThreadId: "deleted" })];
    assert.equal(parentOf(threads, "child"), null);
  });
});
