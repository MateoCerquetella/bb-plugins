import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const threadCardSource = await readFile(
  new URL("../components/inbox/thread-card.tsx", import.meta.url),
  "utf8",
);
const childRowStart = threadCardSource.indexOf("function ChildThreadRow");
const rootSource = threadCardSource.slice(0, childRowStart);
const childSource = threadCardSource.slice(childRowStart);
const familyStatusSource = await readFile(
  new URL("../components/inbox/family-status.tsx", import.meta.url),
  "utf8",
);

describe("compact root card contract", () => {
  it("keeps zero-child and no-PR roots on the same two-row skeleton", () => {
    assert.match(rootSource, /data-dockside-root-title-row/);
    assert.match(rootSource, /data-dockside-root-detail-row/);
    assert.match(rootSource, /data-dockside-root-time/);
    assert.match(rootSource, /data-dockside-root-metadata/);
    assert.match(
      rootSource,
      /data-dockside-root-metadata=""[\s\S]*className="flex h-4 max-w-full items-center justify-end gap-1 whitespace-nowrap"/,
    );
    assert.match(rootSource, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
    assert.match(rootSource, /grid-rows-\[1rem_1rem\]/);
    assert.match(rootSource, /bg-sidebar-accent\/35 py-1/);
    assert.doesNotMatch(rootSource, /bg-sidebar-accent\/35 p-1/);
    assert.doesNotMatch(rootSource, /Done/);
  });

  it("co-locates root PR and multiple-child controls in row two", () => {
    const metadataStart = rootSource.indexOf("data-dockside-root-metadata");
    const pullRequestStart = rootSource.indexOf(
      "<PullRequestMetadata",
      metadataStart,
    );
    const disclosureStart = rootSource.indexOf(
      "{childThreads.length > 0 ? (",
      metadataStart,
    );

    assert.ok(metadataStart >= 0);
    assert.ok(rootSource.indexOf("<FamilyStatusBadge", metadataStart) > metadataStart);
    assert.ok(pullRequestStart > metadataStart);
    assert.ok(disclosureStart > pullRequestStart);
  });

  it("looks up PR data only for the parent and never on child rows", () => {
    assert.equal(
      threadCardSource.match(/useSidebarThreadPullRequest\(thread\.id\)/g)
        ?.length,
      1,
    );
    assert.doesNotMatch(childSource, /useSidebarThreadPullRequest/);
    assert.doesNotMatch(childSource, /PullRequestMetadata/);
  });

  it("truncates long title and branch text without shrinking metadata", () => {
    assert.match(
      rootSource,
      /min-w-0 flex-1 truncate text-sm/,
    );
    assert.match(threadCardSource, /className="truncate font-mono"/);
    assert.match(threadCardSource, /\{branch\}/);
    assert.match(
      rootSource,
      /relative z-10 col-start-3 row-span-2 flex shrink-0 flex-col items-end gap-0\.5/,
    );
  });

  it("keeps semantic, disclosure, provider, and reorder help keyboard-readable", () => {
    assert.match(rootSource, /<FamilyStatusIcon/);
    assert.match(rootSource, /role="tooltip"/);
    assert.match(rootSource, /reorderHelp=/);
    assert.match(familyStatusSource, /aria-keyshortcuts=/);
    assert.match(rootSource, /application\/x-dockside-family|onReorderDragStart/);
    assert.doesNotMatch(rootSource, /function ReorderHandle|group\/reorder/);
    assert.match(familyStatusSource, /w-14/);
    assert.match(familyStatusSource, /px-0/);
    const metadataStart = rootSource.indexOf("data-dockside-root-metadata");
    const badgeStart = rootSource.indexOf("<FamilyStatusBadge", metadataStart);
    assert.ok(badgeStart > metadataStart);
    assert.equal(rootSource.indexOf("<ProviderGlyph", metadataStart), -1, "provider identity stays out of the trailing metadata");
    assert.ok(rootSource.indexOf("<ProviderGlyph") < rootSource.indexOf("data-dockside-root-title-row"));
  });

  it("keeps child status and disclosure-provider help keyboard-readable", () => {
    assert.match(rootSource, /childProviderNames/);
    assert.match(rootSource, /providers: \$\{childProviderNames\}/);
    assert.match(childSource, /<ThreadStateGlyph thread=\{thread\}/);
    assert.match(childSource, /Inactive: no active work in this child thread/);
    assert.match(childSource, /group\/child-status/);
    assert.match(childSource, /tabIndex=\{0\}/);
    assert.match(childSource, /role="tooltip"/);
  });
});
