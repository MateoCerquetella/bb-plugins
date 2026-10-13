import assert from "node:assert/strict";
import test from "node:test";
import { navigationThreads, neighbor, titleFor, statusFor, statusIconFor, swipeDirection, updateGesture, type Thread } from "../lib/navigation.ts";

const thread = (id: string, createdAt: number, extra: Partial<Thread> = {}): Thread =>
  ({ id, createdAt, projectId: "p", title: id, titleFallback: null, parentThreadId: null, isArchived: false, ...extra });

test("project roots sort by creation and deterministic id without mutating input", () => {
  const rows = [thread("b", 1), thread("z", 9), thread("a", 1), thread("other", 20, { projectId: "q" }), thread("archived", 30, { isArchived: true }), thread("child", 10, { parentThreadId: "b" })];
  assert.deepEqual(navigationThreads(rows, "b").map(t => t.id), ["z", "a", "b"]);
  assert.equal(rows[0].id, "b");
  assert.deepEqual(navigationThreads(rows, "child").map(t => t.id), ["child", "z", "a", "b"]);
  assert.deepEqual(navigationThreads(rows, "missing"), []);
  assert.deepEqual(navigationThreads(rows, "archived"), []);
});
test("boundaries and unknown identities never wrap", () => {
  const rows = [thread("a", 2), thread("b", 1)];
  assert.equal(neighbor(rows, "a", -1), null);
  assert.equal(neighbor(rows, "a", 1), "b");
  assert.equal(neighbor(rows, "b", 1), null);
  assert.equal(neighbor(rows, "unknown", 1), null);
  assert.equal(neighbor([rows[0]], "a", 1), null);
});
test("titles use fallback for blank names", () => {
  assert.equal(titleFor(thread("a", 1, { title: " ", titleFallback: "Fallback" })), "Fallback");
  assert.equal(titleFor(undefined), "Untitled thread");
});
test("status preserves live host semantics without inferring completion", () => {
  assert.equal(statusFor({ indicator: "runtime", indicatorLabel: "Thread is working" }), "Thread is working");
  assert.equal(statusFor({ indicator: "waiting-for-input", indicatorLabel: "Thread needs user input" }), "Thread needs user input");
  assert.equal(statusFor({ indicator: "unread-success", indicatorLabel: "Unread response" }), "Unread response");
  assert.equal(statusFor({ indicator: "none", indicatorLabel: null }), "Idle");
  assert.equal(statusFor({ indicator: "future-state", indicatorLabel: "New host status" }), "New host status");
  assert.equal(statusFor({ indicator: "future-state", indicatorLabel: " " }), "Status unavailable");
  assert.equal(statusFor(undefined), "Status unavailable");
});
test("status icons follow Dockside categories and unknown states stay neutral", () => {
  for (const kind of ["runtime", "workflow", "background-agent", "background-command", "plan-mode", "goal"]) {
    assert.equal(statusIconFor(kind), "working");
  }
  assert.equal(statusIconFor("waiting-for-input"), "waiting");
  assert.equal(statusIconFor("unread-error"), "error");
  assert.equal(statusIconFor("unread-success"), "unread");
  assert.equal(statusIconFor("draft"), "draft");
  assert.equal(statusIconFor("working-draft"), "draft");
  assert.equal(statusIconFor("none"), "idle");
  assert.equal(statusIconFor("future"), "unknown");
  assert.equal(statusIconFor(undefined), "unknown");
});
test("swipes require horizontal threshold and matching pointer", () => {
  const start = { id: 1, x: 100, y: 100, cancelled: false };
  assert.equal(swipeDirection(start, 1, 44, 100), 1);
  assert.equal(swipeDirection(start, 1, 156, 100), -1);
  assert.equal(swipeDirection(start, 1, 45, 100), null);
  assert.equal(swipeDirection(start, 1, 0, 125), null);
  assert.equal(swipeDirection(start, 2, 0, 100), null);
  const cancelled = updateGesture(start, 100, 121);
  assert.equal(swipeDirection(updateGesture(cancelled, 0, 100), 1, 0, 100), null);
});
