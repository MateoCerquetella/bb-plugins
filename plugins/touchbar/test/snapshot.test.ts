import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSnapshot,
  compactStatus,
  compactText,
  renderCard,
  renderSummary,
  resolveCardLimit,
  type ThreadSnapshotInput,
} from "../lib/snapshot.ts";

function thread(
  id: string,
  overrides: Partial<ThreadSnapshotInput> = {},
): ThreadSnapshotInput {
  return {
    archivedAt: null,
    deletedAt: null,
    hasPendingInteraction: false,
    id,
    lastReadAt: 100,
    latestAttentionAt: 100,
    projectId: "project-1",
    providerId: "codex",
    runtime: { displayStatus: "idle" },
    status: "idle",
    title: id,
    titleFallback: null,
    updatedAt: 100,
    visibility: "visible",
    ...overrides,
  };
}

test("card limit clamps invalid, low, and high settings", () => {
  assert.equal(resolveCardLimit("wat"), 24);
  assert.equal(resolveCardLimit("0"), 1);
  assert.equal(resolveCardLimit("4"), 4);
  assert.equal(resolveCardLimit("99"), 24);
});

test("compact text removes controls, whitespace, and bounds user text", () => {
  assert.equal(compactText("  hello\n\tworld  ", "fallback", 30), "hello world");
  assert.equal(compactText("", "fallback", 30), "fallback");
  assert.equal(compactText("abcdefghij", "fallback", 6), "abcde…");
});

test("runtime states map to stable compact states", () => {
  assert.equal(compactStatus(thread("a", { runtime: { displayStatus: "provisioning" } })), "active");
  assert.equal(compactStatus(thread("a", { runtime: { displayStatus: "waiting-for-host" } })), "waiting");
  assert.equal(compactStatus(thread("a", { runtime: { displayStatus: "error" } })), "error");
});

test("snapshot prioritizes attention and active work deterministically", () => {
  const snapshot = buildSnapshot(
    [
      thread("idle", { updatedAt: 500 }),
      thread("active", {
        runtime: { displayStatus: "active" },
        status: "active",
        updatedAt: 200,
      }),
      thread("input", { hasPendingInteraction: true, updatedAt: 100 }),
      thread("error", {
        lastReadAt: 100,
        latestAttentionAt: 101,
        runtime: { displayStatus: "error" },
        status: "error",
        updatedAt: 300,
      }),
      thread("waiting", {
        runtime: { displayStatus: "waiting-for-host" },
        updatedAt: 450,
      }),
      thread("unread", { lastReadAt: 10, latestAttentionAt: 20, updatedAt: 400 }),
    ],
    {
      cardLimit: 6,
      includeHidden: false,
      nowMs: 900,
      projectNames: new Map([["project-1", "Workspace"]]),
    },
  );

  assert.deepEqual(snapshot.threads.map((item) => item.id), [
    "input",
    "error",
    "unread",
    "active",
    "waiting",
    "idle",
  ]);
  assert.deepEqual(snapshot.summary, { active: 1, attention: 4, visible: 6 });
  assert.equal(snapshot.generatedAtMs, 900);
  assert.equal(snapshot.threads[0]?.project, "Workspace");
});

test("acknowledged failures do not remain as phantom Touch Bar errors", () => {
  const snapshot = buildSnapshot(
    [
      thread("acknowledged-error", {
        lastReadAt: 200,
        latestAttentionAt: 150,
        runtime: { displayStatus: "error" },
        status: "error",
      }),
      thread("new-error", {
        lastReadAt: 100,
        latestAttentionAt: 150,
        runtime: { displayStatus: "error" },
        status: "error",
      }),
      thread("active", {
        runtime: { displayStatus: "active" },
        status: "active",
      }),
    ],
    { cardLimit: 6, includeHidden: false },
  );

  assert.deepEqual(snapshot.threads.map((item) => item.id), [
    "new-error",
    "active",
  ]);
  assert.deepEqual(snapshot.summary, { active: 1, attention: 1, visible: 2 });
});

test("hidden, archived, and deleted threads are excluded by default", () => {
  const rows = [
    thread("visible"),
    thread("hidden", { visibility: "hidden" }),
    thread("archived", { archivedAt: 20 }),
    thread("deleted", { deletedAt: 30 }),
  ];
  assert.deepEqual(
    buildSnapshot(rows, { cardLimit: 6, includeHidden: false }).threads.map(
      (item) => item.id,
    ),
    ["visible"],
  );
  assert.deepEqual(
    buildSnapshot(rows, { cardLimit: 6, includeHidden: true }).threads.map(
      (item) => item.id,
    ),
    ["hidden", "visible"],
  );
});

test("summary and cards stay compact and useful", () => {
  const empty = buildSnapshot([], { cardLimit: 3, includeHidden: false });
  assert.equal(renderSummary(empty), "BB idle");
  assert.equal(renderCard(empty, 0), "");

  const active = buildSnapshot(
    [
      thread("active", {
        runtime: { displayStatus: "active" },
        status: "active",
        title: "Touch Bar monitor",
      }),
    ],
    { cardLimit: 3, includeHidden: false },
  );
  assert.equal(renderSummary(active), "BB · 1 active");
  assert.equal(renderCard(active, 0), "● Touch Bar monitor · Personal");
});
