import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const server = await readFile(new URL("../server.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../app.tsx", import.meta.url), "utf8");
const inbox = await readFile(
  new URL("../components/inbox/thread-inbox.tsx", import.meta.url),
  "utf8",
);
const card = await readFile(
  new URL("../components/inbox/thread-card.tsx", import.meta.url),
  "utf8",
);
const settings = await readFile(
  new URL("../components/settings/dockside-settings.tsx", import.meta.url),
  "utf8",
);
const projectGroup = await readFile(
  new URL("../components/inbox/project-group.tsx", import.meta.url),
  "utf8",
);
const projectColorsHook = await readFile(
  new URL("../hooks/use-project-colors.ts", import.meta.url),
  "utf8",
);

describe("Dockside settings contract", () => {
  it("declares every palette and behavior setting with safe defaults", () => {
    assert.match(server, /bb\.settings\.define\(/);
    for (const key of [
      "palettePreset",
      "workingColor",
      "workflowColor",
      "agentColor",
      "commandColor",
      "planColor",
      "goalColor",
      "waitingColor",
      "unreadColor",
      "errorColor",
      "idleColor",
      "staleColor",
      "prReviewColor",
      "prChecksColor",
      "prReadyColor",
      "prMergedColor",
      "prDraftColor",
      "prBlockedColor",
      "prClosedColor",
      "rowDensity",
      "statusDisplay",
      "defaultChildExpansion",
      "showProviderIcons",
      "showPullRequestMetadata",
      "showRelativeTime",
    ]) {
      assert.match(server, new RegExp(`${key}:`));
    }
    assert.match(server, /default: "Default"/);
    assert.match(server, /default: "Comfortable"/);
    assert.match(server, /default: "Expanded"/);
  });

  it("registers one settings preview and reads live settings", () => {
    assert.match(app, /app\.slots\.settingsSection\(/);
    assert.match(app, /component: DocksideSettingsSection/);
    assert.match(inbox, /const settings = useSettings\(\)/);
    assert.match(inbox, /resolveDocksidePreferences\(settings\.values\)/);
    assert.match(inbox, /style=\{docksidePreferenceStyle\(preferences\)/);
    assert.match(settings, /familyStatusPresentation/);
    assert.match(settings, /<FamilyStatusIcon/);
    assert.match(settings, /<FamilyStatusBadge/);
    for (const label of [
      "working",
      "needs-you",
      "unread",
      "failed",
      "inactive",
      "stale",
    ]) {
      assert.match(settings, new RegExp(`"${label}"`));
    }
  });

  it("edits durable project-id colors and paints only project letter badges", () => {
    assert.match(server, /PROJECT_COLOR_MIGRATION/);
    assert.match(server, /listProjectColors:/);
    assert.match(server, /setProjectColor:/);
    assert.match(server, /resetProjectColor:/);
    assert.match(server, /bb\.sdk\.projects\.get\(\{ projectId \}\)/);
    assert.match(server, /PROJECT_COLOR_CHANNEL/);
    assert.match(server, /bb\.realtime\.publish\(PROJECT_COLOR_CHANNEL/);

    assert.match(settings, /useSidebarThreads\(\)/);
    assert.match(settings, /data-dockside-project-color-settings/);
    assert.match(settings, /type="color"/);
    assert.match(settings, /Badge color for \{project\.name\}/);
    assert.match(settings, /Save badge color for \$\{project\.name\}/);
    assert.match(settings, /Reset badge color for \$\{project\.name\}/);
    assert.match(settings, /Color changed elsewhere/);
    assert.match(settings, /aria-live="polite"/);

    assert.match(inbox, /useProjectColors\(\)/);
    assert.match(inbox, /projectColorOverrides=\{projectColorOverrides\}/);
    assert.match(projectGroup, /projectBadgePresentation/);
    assert.match(projectGroup, /data-dockside-project-badge/);
    assert.match(projectGroup, /backgroundColor: badge\.backgroundColor/);
    assert.match(projectGroup, /color: badge\.foregroundColor/);
    assert.match(projectColorsHook, /useRealtime\("project-colors"/);
    assert.match(projectColorsHook, /previous === "reconnecting"/);
  });

  it("uses optional metadata and layout preferences without changing defaults", () => {
    assert.match(card, /preferences\.density === "compact"/);
    assert.match(card, /defaultExpanded: preferences\.defaultChildrenExpanded/);
    assert.match(card, /preferences\.showProviderIcons/);
    assert.match(card, /preferences\.showPullRequestMetadata && pullRequest/);
    assert.match(card, /preferences\.showRelativeTime/);
  });

  it("uses a semantic full-row selection target and keeps navigation separate", () => {
    assert.match(card, /data-dockside-selection-target=\{thread\.id\}/);
    assert.match(card, /aria-pressed=/);
    assert.match(card, /disabled=\{selectionDisabledReason !== null\}/);
    assert.match(card, /selectionDisabledReason === null/);
    assert.match(card, /selected: !selected/);
    assert.match(card, /shiftKey: event\.shiftKey/);
    assert.match(card, /interactive=\{!selectionMode\}/);
    assert.match(card, /disabled=\{selectionMode\}/);
    assert.match(card, /selectionMode && "pointer-events-none"/);
    assert.match(card, /actions\.open\(thread\.id/);
  });
});
