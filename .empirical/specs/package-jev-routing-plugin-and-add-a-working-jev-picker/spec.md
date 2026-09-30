# Package Jev Routing Plugin And Add A Working Jev Picker

## Request

> Package Jev routing plugin and add a working Jev picker option on Dyaus; user also authorizes a focused push to bb-plugins

## Goal

Users select Jev routing in the BB model picker on Dyaus and inspect per-thread model history. The plugin is independently installable from the bb-plugins repository.

## Acceptance Criteria

- [ ] [AC-1] The plugin loads on Dyaus without SDK compatibility errors.
- [ ] [AC-2] Any model ID supports a persisted custom color, with distinct Luna, Sol and Astra defaults.
- [ ] [AC-3] Thread history is paginated, close dismisses it, and changes do not fill the conversation with repeated text.
- [ ] [AC-4] Jev is a selectable model backed by a verified routing endpoint.
- [ ] [AC-5] Source, documentation and focused tests are published in bb-plugins without unrelated work.
- [ ] [AC-UI-1] [UI] Picker and history behavior are exercised in a browser.

## Scope
Jev plugin packaging, SDK compatibility, routing registration and Dyaus installation.

## Non-goals
Rewriting other providers, migrating unrelated plugins, or claiming cache sharing between different models.

## Risks
The routing service currently lives on a different machine. A picker entry without working transport would fail at execution. Catalog changes must preserve all existing models and supported_reasoning_levels.

## Verification
Type checking, focused color/history tests, build, real plugin RPC calls, routing smoke request, and browser interaction checks.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
