# Decisions: Activity Overview

Record concise, externally reviewable choices for the implementation.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- Existing installable plugins use `definePluginApp` with a colocated React
  entry, CSS, package scripts, and README.
- The approved capability delta requires local deterministic selector-driven
  summaries and explicitly excludes credentials and a backend.
- Repository design language calls for compact operational density and host
  semantic tokens.

### Options

- Build a plugin with a server/API adapter and live repository data.
- Build a self-contained React plugin with a pure local view-model and replaceable
  data boundary.

### Chosen approach

Use the SDK homepageSection registration for New Thread placement. A
newThreadPanelAction alone would still hide the dashboard behind an action;
DOM injection would duplicate supported host behavior and introduce fragility.

Use the self-contained React plugin and pure local view-model so interactions
are deterministic, testable, and independently installable.

### Trade-offs and risks

Static data is not a live account view, but it avoids credentials and keeps the
requested visual dashboard reliable. A future adapter can replace the pure
data module without changing the presentation contract.

### Verification

Run focused data tests, plugin typecheck and build, workspace checks, then
browser verification of rendering, selectors, keyboard focus, and responsive
layout.
