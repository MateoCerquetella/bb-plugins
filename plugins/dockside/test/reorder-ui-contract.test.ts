import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const inbox = await readFile(
  new URL("../components/inbox/thread-inbox.tsx", import.meta.url),
  "utf8",
);
const group = await readFile(
  new URL("../components/inbox/project-group.tsx", import.meta.url),
  "utf8",
);
const card = await readFile(
  new URL("../components/inbox/thread-card.tsx", import.meta.url),
  "utf8",
);
const familyStatus = await readFile(
  new URL("../components/inbox/family-status.tsx", import.meta.url),
  "utf8",
);

describe("family reorder UI contract", () => {
  it("applies persisted complete-family order before filter and search", () => {
    assert.ok(inbox.indexOf("applyProjectOrder(") < inbox.indexOf("filterProjectThreadGroups("));
    const apply = inbox.indexOf("families: applyFamilyOrder(");
    const filter = inbox.indexOf("filterProjectThreadGroups(", apply);
    const search = inbox.indexOf("searchProjectThreadGroups(", filter);
    assert.ok(apply >= 0);
    assert.ok(filter > apply);
    assert.ok(search > filter);
  });

  it("disables reorder for selection, filters, and host search", () => {
    assert.match(inbox, /selectionMode\s*\? "Exit bulk selection/);
    assert.match(inbox, /activePreset !== "all"/);
    assert.match(inbox, /searching\s*\? "Clear search/);
    assert.match(inbox, /reorderEnabled=\{reorderEnabled\}/);
  });

  it("wires explicit drag and keyboard controls with announcements", () => {
    assert.match(group, /application\/x-dockside-family/);
    assert.match(group, /application\/x-dockside-project/);
    assert.match(group, /data-dockside-project/);
    assert.match(group, /draggable=\{projectReorderEnabled\}/);
    assert.match(group, /sourceProjectId: dragged\.projectId/);
    assert.match(group, /targetProjectId: group\.project\.id/);
    assert.match(card, /draggable=\{reorderEnabled\}/);
    assert.match(familyStatus, /aria-keyshortcuts=/);
    assert.doesNotMatch(card, /ReorderHandle|group\/reorder/);
    assert.doesNotMatch(group, /name="Drag|name="Grip|name="Move/);
    assert.match(inbox, /aria-live="polite"/);
    assert.match(inbox, /Thread families cannot move between projects/);
    assert.match(inbox, /Pinned and unpinned thread families cannot cross/);
  });

  it("keeps navigation split props and bulk selection overlays independent", () => {
    assert.match(card, /\.\.\.splitProps/);
    assert.match(card, /data-dockside-selection-target/);
    assert.match(card, /onReorderDragStart/);
    assert.match(card, /onToggleSelected/);
  });
});
