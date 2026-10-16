import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("workspace filter UI contract", () => {
  it("presents grouped descriptive filters and an explicit active state", async () => {
    const [menu, inbox] = await Promise.all([
      readFile(
        new URL("../components/inbox/filter-menu.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/inbox/thread-inbox.tsx", import.meta.url),
        "utf8",
      ),
    ]);

    assert.match(inbox, />\s*Chats\s*</);
    assert.match(menu, /aria-label=\{`Filter chats:/);
    assert.match(menu, /label: "Projects"/);
    assert.doesNotMatch(menu, /label: "Updated"/);
    assert.match(menu, /label: "Status"/);
    assert.match(menu, /label: "Environment"/);
    assert.match(menu, /<SelectLabel>Group by<\/SelectLabel>/);
    assert.match(menu, /<SelectLabel>Status<\/SelectLabel>/);
    assert.match(menu, /label: "Failed"/);
    assert.match(inbox, /activePreset === "status"/);
    assert.match(inbox, /setWorkspaceFilter\(ALL_WORKSPACES_FILTER\)/);
    assert.match(inbox, /statusGroups\.map/);
    assert.match(inbox, /groupSidebarFamilies\(families\)/);
    assert.match(inbox, /localStorage\.setItem\("dockside:group-by"/);
    const statusGroup = await readFile(
      new URL("../components/inbox/status-group.tsx", import.meta.url),
      "utf8",
    );
    assert.match(statusGroup, /<ThreadCard/);
    assert.match(statusGroup, /text-xs font-semibold text-foreground\/90/);
    assert.match(statusGroup, /\{group\.families\.length\}/);
    assert.match(statusGroup, /transition-transform/);
    assert.match(
      statusGroup,
      /effectiveExpanded = forceExpanded \|\| expanded/,
    );
    assert.match(statusGroup, /aria-expanded=\{effectiveExpanded\}/);
    assert.match(statusGroup, /\{group.label\}/);
    assert.match(statusGroup, /\{effectiveExpanded \? \(/);
  });
});
