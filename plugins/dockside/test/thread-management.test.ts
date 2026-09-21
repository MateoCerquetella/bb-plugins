import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@bb/plugin-sdk";
import { groupThreadsByProject } from "../lib/inbox.ts";
import {
  applyRootSelection,
  bulkEligibility,
  DAY_MS,
  familyIsQuiet,
  familyUpdatedAt,
  filterProjectThreadGroups,
  includeSelectedFamilies,
  pruneSelectedRootIds,
  resolveFamilyExpanded,
  selectableRootIds,
  THREAD_FILTER_OPTIONS,
  THREAD_FILTER_PRESETS,
} from "../lib/thread-management.ts";

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

const projects: PluginSidebarProject[] = [
  { id: "proj_1", name: "One", isPersonal: false },
  { id: "proj_2", name: "Two", isPersonal: false },
];

describe("family status", () => {
  it("uses the newest member update and requires every member to be quiet", () => {
    const groups = groupThreadsByProject(
      [
        thread({ id: "root", updatedAt: 10 }),
        thread({
          id: "child",
          parentThreadId: "root",
          updatedAt: 40,
          isUnread: true,
        }),
      ],
      projects,
    );
    const family = groups[0]?.families[0];
    assert.ok(family);
    assert.equal(familyUpdatedAt(family), 40);
    assert.equal(familyIsQuiet(family), false);
  });
});

describe("filterProjectThreadGroups", () => {
  const now = 10 * DAY_MS;
  const groups = groupThreadsByProject(
    [
      thread({ id: "working", indicator: "runtime", updatedAt: now }),
      thread({
        id: "waiting",
        hasPendingInteraction: true,
        updatedAt: now - 2 * DAY_MS,
      }),
      thread({ id: "unread", isUnread: true, updatedAt: now - 8 * DAY_MS }),
      thread({ id: "quiet-new", updatedAt: now - DAY_MS + 1 }),
      thread({ id: "quiet-day", updatedAt: now - DAY_MS }),
      thread({
        id: "quiet-week",
        projectId: "proj_2",
        updatedAt: now - 7 * DAY_MS,
      }),
    ],
    projects,
  );

  function ids(preset: Parameters<typeof filterProjectThreadGroups>[1]) {
    return filterProjectThreadGroups(groups, preset, now).flatMap((group) =>
      group.families.map((family) => family.root.id),
    );
  }

  it("supports attention and quiet presets", () => {
    assert.deepEqual(ids("status"), [
      "quiet-day",
      "quiet-new",
      "unread",
      "waiting",
      "working",
      "quiet-week",
    ]);
    assert.deepEqual(ids("working"), ["working"]);
    assert.deepEqual(ids("needs-you"), ["waiting"]);
    assert.deepEqual(ids("unread"), ["unread"]);
    assert.deepEqual(ids("quiet"), ["quiet-day", "quiet-new", "quiet-week"]);
  });

  it("uses inclusive family age boundaries", () => {
    assert.deepEqual(ids("quiet-1d"), ["quiet-day", "quiet-week"]);
    assert.deepEqual(ids("quiet-7d"), ["quiet-week"]);
  });

  it("preserves project and family order without mutating the input", () => {
    const before = groups.map((group) => group.families.length);
    assert.deepEqual(
      filterProjectThreadGroups(groups, "quiet", now).map(
        (group) => group.project.id,
      ),
      ["proj_1", "proj_2"],
    );
    assert.deepEqual(
      groups.map((group) => group.families.length),
      before,
    );
  });
});

describe("thread filter presentation", () => {
  it("describes every preset once in the intended menu hierarchy", () => {
    assert.deepEqual(
      THREAD_FILTER_OPTIONS.map((option) => option.preset),
      THREAD_FILTER_PRESETS,
    );
    assert.deepEqual(
      THREAD_FILTER_OPTIONS.filter((option) => option.group === "status").map(
        (option) => option.preset,
      ),
      ["working", "needs-you", "unread"],
    );
    assert.deepEqual(
      THREAD_FILTER_OPTIONS.filter(
        (option) => option.group === "inactivity",
      ).map((option) => option.preset),
      ["quiet", "quiet-1d", "quiet-7d"],
    );
    assert.ok(
      THREAD_FILTER_OPTIONS.every(
        (option) => option.label.length > 0 && option.description.length > 0,
      ),
    );
  });
});

describe("bulkEligibility", () => {
  function eligibility(
    root: Partial<PluginSidebarThread>,
    child?: Partial<PluginSidebarThread>,
    activeThreadId: string | null = null,
  ) {
    const rows = [thread({ id: "root", ...root })];
    if (child) rows.push(thread({ id: "child", parentThreadId: "root", ...child }));
    const family = groupThreadsByProject(rows, projects)[0]?.families[0];
    assert.ok(family);
    return bulkEligibility(family, activeThreadId);
  }

  it("protects the current, working, waiting, unread, and pinned family", () => {
    assert.deepEqual(eligibility({}, undefined, "root"), {
      eligible: false,
      reason: "current",
    });
    assert.deepEqual(eligibility({}, { indicator: "runtime" }), {
      eligible: false,
      reason: "working",
    });
    assert.deepEqual(eligibility({ hasPendingInteraction: true }), {
      eligible: false,
      reason: "waiting",
    });
    assert.deepEqual(eligibility({}, { isUnread: true }), {
      eligible: false,
      reason: "unread",
    });
    assert.deepEqual(eligibility({ isPinned: true }), {
      eligible: false,
      reason: "pinned",
    });
  });

  it("allows a quiet read family", () => {
    assert.deepEqual(eligibility({}, {}), { eligible: true });
  });
});

describe("selection helpers", () => {
  it("selects eligible visible roots and prunes roots that disappeared", () => {
    const groups = groupThreadsByProject(
      [thread({ id: "a" }), thread({ id: "b", isUnread: true })],
      projects,
    );
    assert.deepEqual(selectableRootIds(groups, null), ["a"]);
    assert.deepEqual(
      [...pruneSelectedRootIds(new Set(["a", "missing"]), groups)],
      ["a"],
    );
  });

  it("keeps a selected family visible after it stops matching the filter", () => {
    const allGroups = groupThreadsByProject(
      [
        thread({ id: "selected", isUnread: true }),
        thread({ id: "quiet" }),
      ],
      projects,
    );
    const quietGroups = filterProjectThreadGroups(allGroups, "quiet", 1_000);

    const visible = includeSelectedFamilies(
      quietGroups,
      allGroups,
      new Set(["selected"]),
    );

    assert.deepEqual(
      visible[0]?.families.map((family) => family.root.id),
      ["quiet", "selected"],
    );
  });
});

describe("applyRootSelection", () => {
  const visible = ["a", "b", "c", "d"] as const;

  it("ordinary clicks toggle one root and replace the anchor", () => {
    const selected = new Set(["a"]);
    const result = applyRootSelection({
      selectedRootIds: selected,
      visibleEligibleRootIds: visible,
      anchorRootId: "a",
      targetRootId: "c",
      targetSelected: true,
      shiftKey: false,
    });

    assert.deepEqual([...result.selectedRootIds], ["a", "c"]);
    assert.equal(result.anchorRootId, "c");
    assert.deepEqual([...selected], ["a"]);
  });

  it("selects inclusive forward and reverse Shift ranges", () => {
    const forward = applyRootSelection({
      selectedRootIds: new Set(["a"]),
      visibleEligibleRootIds: visible,
      anchorRootId: "a",
      targetRootId: "c",
      targetSelected: true,
      shiftKey: true,
    });
    assert.deepEqual([...forward.selectedRootIds], ["a", "b", "c"]);
    assert.equal(forward.anchorRootId, "a");

    const reverse = applyRootSelection({
      selectedRootIds: new Set(["d"]),
      visibleEligibleRootIds: visible,
      anchorRootId: "d",
      targetRootId: "b",
      targetSelected: true,
      shiftKey: true,
    });
    assert.deepEqual([...reverse.selectedRootIds], ["d", "b", "c"]);
    assert.equal(reverse.anchorRootId, "d");
  });

  it("uses the clicked checked state to deselect a range", () => {
    const result = applyRootSelection({
      selectedRootIds: new Set(visible),
      visibleEligibleRootIds: visible,
      anchorRootId: "a",
      targetRootId: "c",
      targetSelected: false,
      shiftKey: true,
    });

    assert.deepEqual([...result.selectedRootIds], ["d"]);
    assert.equal(result.anchorRootId, "a");
  });

  it("skips protected gaps omitted from eligible order", () => {
    const result = applyRootSelection({
      selectedRootIds: new Set(["a"]),
      visibleEligibleRootIds: ["a", "c"],
      anchorRootId: "a",
      targetRootId: "c",
      targetSelected: true,
      shiftKey: true,
    });

    assert.deepEqual([...result.selectedRootIds], ["a", "c"]);
    assert.equal(result.selectedRootIds.has("b"), false);
  });

  it("falls back to one toggle when the anchor is no longer visible", () => {
    const result = applyRootSelection({
      selectedRootIds: new Set(["hidden"]),
      visibleEligibleRootIds: ["b", "c"],
      anchorRootId: "hidden",
      targetRootId: "c",
      targetSelected: true,
      shiftKey: true,
    });

    assert.deepEqual([...result.selectedRootIds], ["hidden", "c"]);
    assert.equal(result.anchorRootId, "c");
  });

  it("fails closed when the target is no longer eligible", () => {
    const selected = new Set(["a"]);
    const result = applyRootSelection({
      selectedRootIds: selected,
      visibleEligibleRootIds: ["a"],
      anchorRootId: "a",
      targetRootId: "protected",
      targetSelected: true,
      shiftKey: true,
    });

    assert.deepEqual([...result.selectedRootIds], ["a"]);
    assert.equal(result.anchorRootId, null);
    assert.deepEqual([...selected], ["a"]);
  });
});

describe("resolveFamilyExpanded", () => {
  it("keeps a family with no children closed", () => {
    assert.equal(
      resolveFamilyExpanded({ childCount: 0, forceExpanded: true, override: true }),
      false,
    );
  });

  it("opens a child family by default and while search forces it", () => {
    assert.equal(
      resolveFamilyExpanded({ childCount: 3, forceExpanded: false, override: null }),
      true,
    );
    assert.equal(
      resolveFamilyExpanded({ childCount: 3, forceExpanded: true, override: false }),
      true,
    );
  });

  it("respects explicit open and closed overrides", () => {
    assert.equal(
      resolveFamilyExpanded({ childCount: 3, forceExpanded: false, override: true }),
      true,
    );
    assert.equal(
      resolveFamilyExpanded({ childCount: 3, forceExpanded: false, override: false }),
      false,
    );
  });

  it("uses the configured default until search or a user override wins", () => {
    assert.equal(
      resolveFamilyExpanded({
        childCount: 3,
        forceExpanded: false,
        override: null,
        defaultExpanded: false,
      }),
      false,
    );
    assert.equal(
      resolveFamilyExpanded({
        childCount: 3,
        forceExpanded: true,
        override: null,
        defaultExpanded: false,
      }),
      true,
    );
    assert.equal(
      resolveFamilyExpanded({
        childCount: 3,
        forceExpanded: false,
        override: true,
        defaultExpanded: false,
      }),
      true,
    );
  });
});
