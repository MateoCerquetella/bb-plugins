import assert from "node:assert/strict";
import test from "node:test";
import {
  SEEDED_ACTIONS,
  actionKind,
  applyDiscoveredCatalog,
  catalogFingerprint,
  compactActionLabel,
  initialActionCatalog,
  parseStoredActionCatalog,
  serializeActionCatalog,
  uniqueActions,
} from "../lib/action-catalog.ts";

test("starts with the action set shown in the BB right-panel launcher", () => {
  const actions = initialActionCatalog(null);
  assert.deepEqual(
    actions.map((action) => compactActionLabel(action.label)),
    [
      "browser",
      "terminal",
      "Recap",
      "File Manager",
      "Files",
      "Git History",
      "side chat",
      "Taskboard",
      "Workflow run",
    ],
  );
  assert.notEqual(actions, SEEDED_ACTIONS);
});

test("normalizes, bounds, and deduplicates a discovered action catalog", () => {
  assert.deepEqual(
    uniqueActions([
      { id: " one ", label: "  First   action " },
      { id: "one", label: "Duplicate" },
      { id: "two", label: "Second" },
      { id: "", label: "No id" },
      { id: "three", label: "" },
      null,
    ]),
    [
      { id: "one", label: "First action" },
      { id: "two", label: "Second" },
    ],
  );
});

test("round-trips valid storage and rejects unknown storage versions", () => {
  const actions = [
    { id: "plugin-action:demo:one", label: "Demo" },
    { id: "plugin-action:demo:two", label: "Another" },
  ];
  assert.deepEqual(parseStoredActionCatalog(serializeActionCatalog(actions)), actions);
  assert.deepEqual(
    parseStoredActionCatalog(JSON.stringify({ version: 2, actions })),
    [],
  );
  assert.deepEqual(parseStoredActionCatalog("not json"), []);
});

test("a visible launcher replaces the seed while an absent launcher preserves it", () => {
  const current = [...SEEDED_ACTIONS];
  assert.deepEqual(applyDiscoveredCatalog(current, []), current);
  assert.deepEqual(
    applyDiscoveredCatalog(current, [
      { id: "plugin-action:demo:open", label: "Demo" },
    ]),
    [{ id: "plugin-action:demo:open", label: "Demo" }],
  );
});

test("classifies known and third-party action labels for compact glyphs", () => {
  assert.equal(actionKind({ id: "x", label: "Open browser" }), "browser");
  assert.equal(actionKind({ id: "x", label: "Start terminal" }), "terminal");
  assert.equal(actionKind({ id: "plugin-action:file-manager:x", label: "Files" }), "files");
  assert.equal(actionKind({ id: "plugin-action:filetree:files", label: "Files" }), "files");
  assert.equal(actionKind({ id: "plugin-action:demo:x", label: "Custom" }), "generic");
  assert.notEqual(
    catalogFingerprint([{ id: "x", label: "First" }]),
    catalogFingerprint([{ id: "x", label: "Second" }]),
  );
});
