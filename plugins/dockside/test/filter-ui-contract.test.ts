import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("workspace filter UI contract", () => {
  it("presents grouped descriptive filters and an explicit active state", async () => {
    const [menu, inbox, select] = await Promise.all([
      readFile(
        new URL("../components/inbox/filter-menu.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../components/inbox/thread-inbox.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../components/ui/select.tsx", import.meta.url), "utf8"),
    ]);

    assert.match(inbox, />\s*Workspaces\s*</);
    assert.match(menu, /Filter workspaces/);
    assert.match(menu, /status: "Status"/);
    assert.match(menu, /inactivity: "Inactivity"/);
    assert.match(menu, /<FilterOption preset="all"/);
    assert.match(menu, /value === "all" \? null/);
    assert.match(menu, /max-w-20 truncate/);
    assert.match(menu, /items-start py-1/);
    assert.match(menu, /w-64 bg-background/);
    assert.match(menu, /aria-label={`Filter workspaces: \${label}`}/);
    assert.match(menu, /option\.description/);
    assert.match(select, /SelectPrimitive\.ItemIndicator/);
    assert.match(select, /focus:bg-state-hover/);
  });
});
