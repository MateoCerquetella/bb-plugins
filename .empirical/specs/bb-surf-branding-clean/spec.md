# Bb Surf Branding Clean

## Request

> Rebuild the already implemented BB Surf branding and responsiveness follow-up from current main so review contains only this feature. Preserve compatibility identifiers and upstream Steel attribution. Update the root and plugin READMEs and icon accessibility title to BB Surf, suspend automatic hover sampling while panel expansion is pinned, preserve compact and hover behavior, add the browser behavior assertion, then run independent review and focused plugin/browser verification. Do not publish or rename the compatibility protocol.

## Goal

Every BB-owned label and current README calls the plugin BB Surf. Existing
installations, automation, project sessions, and upstream attribution remain
compatible. A manually pinned expanded panel does not keep an unnecessary
hover polling loop active.

## Acceptance Criteria

- [ ] [AC-1] The root README, plugin README, manifest display name, navigation,
  headings, instructions, and icon accessibility title use BB Surf for the
  current user-facing name.
- [ ] [AC-2] Steel Browser attribution remains accurate, and stable
  `steel-browser` package/plugin/path IDs, CLI commands, directives, storage
  keys, environment variables, fixtures, Docker containers, and systemd
  services remain unchanged.
- [ ] [AC-3] The plugin README explains panel behavior, compatibility,
  project isolation, and verification commands.
- [ ] [AC-UI-4] [UI] The panel, inline viewer, plugin page, manifest, and icon
  expose BB Surf in light and dark themes.
- [ ] [AC-5] A pinned expanded panel does not run automatic hover sampling;
  compact and hover expansion behavior stays unchanged.
- [ ] [AC-6] Focused type, test, build, and browser interaction checks pass.

## Scope

`README.md`, `plugins/steel-browser` display copy and accessibility metadata,
the panel expansion hook, and focused browser tests.

## Non-goals

No rename of compatibility identifiers, upstream products, historical
Empirical records, technical fixture domains, or host services. No new engine,
session protocol, publication, or unmeasured performance claim.

## Verification

Run the focused steel-browser workspace check and the panel browser fixture.
Confirm light, dark, desktop, and touch behavior. Search current source and
documentation for stale product branding while retaining intentional technical
and upstream references.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
