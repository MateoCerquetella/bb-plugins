import assert from "node:assert/strict";
import test from "node:test";
import { autoBoxes, browserNodeId, connectedThreads, freeBox, edgePath, workspaceColor, workspaceLayout } from "./graph.ts";
import { uiCommandSchema, zoomAnchor } from "./control.ts";
import type { Snapshot } from "./contract";

const thread = (id: string, parentThreadId: string | null = null, projectId = "p1"): Snapshot["threads"][number] => ({
  id, parentThreadId, projectId, environmentId: `env-${id}`, title: id, project: projectId,
  environment: id, branch: id, provider: "test", state: "idle", updatedAt: 1,
});

test("a filtered child retains parents and siblings across project/worktree boundaries", () => {
  const parent = thread("parent");
  const child = thread("child", "parent", "p2");
  const sibling = thread("sibling", "parent");
  const unrelated = thread("unrelated");
  assert.deepEqual(connectedThreads([child], [parent, child, sibling, unrelated]).map((item) => item.id), ["parent", "child", "sibling"]);
  assert.deepEqual(connectedThreads([], [parent, child]), []);
});

test("cycles terminate and every thread has a finite box", () => {
  const threads = [thread("a", "b"), thread("b", "a"), thread("c", "missing")];
  assert.equal(connectedThreads([threads[0]], threads).length, 2);
  const boxes = autoBoxes(threads);
  assert.equal(boxes.size, 3);
  for (const box of boxes.values()) assert.ok(Object.values(box).every(Number.isFinite));
});

test("automatic positions are stable across refresh order and children follow parents", () => {
  const threads = [thread("parent"), thread("child", "parent"), thread("other")];
  const first = autoBoxes(threads), second = autoBoxes([...threads].reverse());
  for (const item of threads) assert.deepEqual(first.get(item.id), second.get(item.id));
  assert.ok(first.get("child")!.x > first.get("parent")!.x);
});

test("independent agent families tile across the canvas instead of forming one long column", () => {
  const threads = Array.from({ length: 9 }, (_, index) => thread(`root-${index}`));
  const boxes = autoBoxes(threads);
  const xValues = new Set(threads.map((item) => boxes.get(item.id)?.x));
  const yValues = threads.map((item) => boxes.get(item.id)?.y ?? 0);

  assert.equal(xValues.size, 3);
  assert.ok(Math.max(...yValues) < 4_000);
});

test("browser identity includes the owner and edges follow moved geometry", () => {
  const browser = { id: "tab1", threadId: "parent", environmentId: null, title: "", location: "Browser", target: null };
  assert.notEqual(browserNodeId(browser), browserNodeId({ ...browser, threadId: "child" }));
  const from = { x: 10, y: 10, w: 520, h: 420 }, to = { x: 650, y: 10, w: 320, h: 260 };
  assert.notEqual(edgePath(from, to), edgePath({ ...from, x: 50 }, to));
});

test("workspace squares enclose every agent and browser without overlapping groups", () => {
  const threads = Array.from({ length: 18 }, (_, index) => ({
    ...thread(`t${index}`, null, `p${index % 5}`), environmentId: `env-${index}`,
  }));
  const browsers = threads.slice(0, 5).map((item) => ({
    id: `tab-${item.id}`, threadId: item.id, environmentId: item.environmentId,
    title: "Browser", location: "https://example.com", target: null,
  }));
  const { groups, nodes } = workspaceLayout(threads, browsers);
  assert.equal(groups.length, 5);
  assert.equal(nodes.size, 23);
  for (const group of groups) {
    assert.equal(group.w, group.h);
    for (const id of group.nodeIds) {
      const box = nodes.get(id)!;
      assert.ok(box.x >= group.x && box.y >= group.y + 48);
      assert.ok(box.x + box.w <= group.x + group.w && box.y + box.h <= group.y + group.h);
    }
    for (const other of groups.filter((item) => item.id !== group.id)) {
      assert.ok(group.x + group.w <= other.x || other.x + other.w <= group.x ||
        group.y + group.h <= other.y || other.y + other.h <= group.y);
    }
  }
  assert.deepEqual(workspaceLayout([...threads].reverse(), [...browsers].reverse()), { groups, nodes });
});

test("workspace colors remain stable and panes can move beyond workspace boundaries", () => {
  assert.equal(workspaceColor("project:environment"), workspaceColor("project:environment"));
  assert.deepEqual(freeBox({ x: -2000, y: 8000, w: 536, h: 420 }),
    { x: -2000, y: 8000, w: 536, h: 420 });
  assert.deepEqual(freeBox({ x: -200000, y: 200000, w: 9999, h: 12 }),
    { x: -100000, y: 100000, w: 900, h: 260 });
});

test("zoom keeps the world point under the cursor stationary", () => {
  const result = zoomAnchor(400, 300, 200, 100, 1, .5);
  assert.equal((400 + 200) / 1, (result.left + 200) / .5);
  assert.equal((300 + 100) / 1, (result.top + 100) / .5);
});

test("UI control accepts only bounded visual commands", () => {
  assert.ok(uiCommandSchema.safeParse({ action: "zoom", value: .5 }).success);
  assert.ok(uiCommandSchema.safeParse({ action: "workspace", workspaceId: null }).success);
  assert.equal(uiCommandSchema.safeParse({ action: "zoom", value: Infinity }).success, false);
  assert.equal(uiCommandSchema.safeParse({ action: "zoom", value: 30 }).success, false);
  assert.equal(uiCommandSchema.safeParse({ action: "send", threadId: "t1", text: "hi" }).success, false);
});
