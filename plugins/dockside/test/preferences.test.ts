import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUSTOM_COLOR_DEFAULTS,
  docksidePreferenceStyle,
  resolveDocksidePreferences,
  SEMANTIC_COLOR_ROLES,
} from "../lib/preferences.ts";

describe("resolveDocksidePreferences", () => {
  it("preserves current behavior while settings load or are unknown", () => {
    const loading = resolveDocksidePreferences(undefined);
    assert.equal(loading.palettePreset, "Default");
    assert.equal(loading.density, "comfortable");
    assert.equal(loading.defaultChildrenExpanded, true);
    assert.equal(loading.showProviderIcons, true);
    assert.equal(loading.showPullRequestMetadata, true);
    assert.equal(loading.showRelativeTime, true);
    assert.equal(loading.colors.working, "#E9D84A");
    assert.equal(loading.colors.waiting, "#F58220");
    assert.equal(loading.colors.unread, "#34A853");
    assert.equal(loading.colors.prReady, "#34A853");

    const malformed = resolveDocksidePreferences({
      palettePreset: "Unknown",
      rowDensity: "Tiny",
      defaultChildExpansion: "Sometimes",
      showProviderIcons: "false",
    });
    assert.equal(malformed.palettePreset, "Default");
    assert.equal(malformed.density, "comfortable");
    assert.equal(malformed.defaultChildrenExpanded, true);
    assert.equal(malformed.showProviderIcons, true);
  });

  it("accepts either status display mode and safely defaults invalid saved values", () => {
    assert.equal(resolveDocksidePreferences(undefined).statusDisplay, "Icons");
    assert.equal(resolveDocksidePreferences({ statusDisplay: "Verbose" }).statusDisplay, "Verbose");
    assert.equal(resolveDocksidePreferences({ statusDisplay: "Icons" }).statusDisplay, "Icons");
    assert.equal(resolveDocksidePreferences({ statusDisplay: "unknown" }).statusDisplay, "Icons");
    assert.equal(resolveDocksidePreferences({ statusDisplay: true }).statusDisplay, "Icons");
  });

  it("resolves distinct high-contrast and colorblind-friendly presets", () => {
    const contrast = resolveDocksidePreferences({
      palettePreset: "High contrast",
    });
    const colorblind = resolveDocksidePreferences({
      palettePreset: "Colorblind-friendly",
    });

    for (const role of SEMANTIC_COLOR_ROLES) {
      assert.match(contrast.colors[role], /^#[0-9A-F]{6}$/);
      assert.match(colorblind.colors[role], /^#[0-9A-F]{6}$/);
    }
    assert.notDeepEqual(contrast.colors, colorblind.colors);
  });

  it("accepts only six-digit custom hex colors and falls back per role", () => {
    const preferences = resolveDocksidePreferences({
      palettePreset: "Custom",
      workingColor: "  #abcdef ",
      waitingColor: "red",
      unreadColor: "#12345",
      errorColor: "#1234567",
      idleColor: "var(--bad)",
      staleColor: "#445566",
      prReviewColor: "#010203",
    });

    assert.equal(preferences.colors.working, "#ABCDEF");
    assert.equal(preferences.colors.waiting, CUSTOM_COLOR_DEFAULTS.waiting);
    assert.equal(preferences.colors.unread, CUSTOM_COLOR_DEFAULTS.unread);
    assert.equal(preferences.colors.error, CUSTOM_COLOR_DEFAULTS.error);
    assert.equal(
      preferences.colors.inactive,
      CUSTOM_COLOR_DEFAULTS.inactive,
    );
    assert.equal(preferences.colors.stale, "#445566");
    assert.equal(preferences.colors.prReview, "#010203");
  });

  it("resolves behavior preferences independently of palette", () => {
    const preferences = resolveDocksidePreferences({
      palettePreset: "Custom",
      rowDensity: "Compact",
      defaultChildExpansion: "Collapsed",
      showProviderIcons: false,
      showPullRequestMetadata: false,
      showRelativeTime: false,
    });

    assert.equal(preferences.density, "compact");
    assert.equal(preferences.defaultChildrenExpanded, false);
    assert.equal(preferences.showProviderIcons, false);
    assert.equal(preferences.showPullRequestMetadata, false);
    assert.equal(preferences.showRelativeTime, false);
  });
});

describe("docksidePreferenceStyle", () => {
  it("projects only owner-scoped semantic variables", () => {
    const style = docksidePreferenceStyle(
      resolveDocksidePreferences({ palettePreset: "Colorblind-friendly" }),
    );
    assert.deepEqual(Object.keys(style).sort(), [
      "--dockside-pr-blocked",
      "--dockside-pr-checks",
      "--dockside-pr-closed",
      "--dockside-pr-draft",
      "--dockside-pr-merged",
      "--dockside-pr-ready",
      "--dockside-pr-review",
      "--dockside-status-agent",
      "--dockside-status-command",
      "--dockside-status-error",
      "--dockside-status-goal",
      "--dockside-status-inactive",
      "--dockside-status-plan",
      "--dockside-status-stale",
      "--dockside-status-unread",
      "--dockside-status-waiting",
      "--dockside-status-workflow",
      "--dockside-status-working",
    ]);
    assert.equal(style["--dockside-status-working"], "#009E73");
  });
});
