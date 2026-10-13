# Activity Overview

## Request

> Please do it as the picture NOW. Build a new independently installable BB plugin mimicking the supplied screenshot's lower Overview dashboard: contributions, pull requests opened, pull requests merged, reviews, period/repository selectors, annual contribution heatmap, current/longest streak, most-active month/day, and needs-your-attention list. Choose sensible implementation defaults from this repository and proceed autonomously.

## Goal

Ship an independently installable `activity-overview` BB plugin that opens a
polished activity dashboard modeled on the supplied reference. It presents
contribution metrics and attention items using deterministic local data, with
period and repository controls that update the visible summary without an
external account.

## Acceptance Criteria

- [ ] [AC-1] The plugin has its own manifest, app entry, styles, README, package
  scripts, and workspace catalog entry under `plugins/activity-overview`.
- [ ] [AC-UI-1] [UI] Opening New Thread shows the Overview dashboard below the
  composer without opening Settings or an action panel, with four
  headline metrics: contributions, pull requests opened, pull requests
  merged, and reviews.
- [ ] [AC-UI-2] [UI] Period and repository selectors are visible controls;
  changing either updates metric values and selected state without a reload.
- [ ] [AC-UI-3] [UI] The dashboard includes an annual contribution heatmap,
  current and longest streak values, most-active month and day callouts, and a
  needs-your-attention list.
- [ ] [AC-UI-4] [UI] The layout remains readable at narrow and wide viewport
  widths, uses labelled controls, and exposes visible keyboard focus states.
- [ ] [AC-2] Typecheck, focused tests, and build pass with the pinned BB SDK;
  tests cover selector state changes and deterministic summary data.

## Scope

Implement the dashboard UI, local view-model data, selector interactions,
responsive styling, plugin metadata, and focused tests. Follow existing plugin
conventions and avoid a backend or external credentials.

## Non-goals

No live GitHub/API integration, authentication, persistence, routing, editing
of repositories, or changes to existing plugins.

## Verification

Run the plugin typecheck, focused test, and build scripts, then workspace
checks. Capture browser evidence for the rendered dashboard and selector
interactions during UI verification.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
