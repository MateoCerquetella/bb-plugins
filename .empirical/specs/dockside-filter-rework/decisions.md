# Decisions

## D-000: Preserve behavior and enrich the existing Select

Status: Accepted

### Evidence

The current pure helpers already implement and test the seven required filter
semantics. Dockside's vendored Select already supplies BB-compatible overlay,
keyboard, dismissal, and focus behavior. The UI/UX consult found the proposed
standalone All row followed by Status and Inactivity groups clear, with only
low-severity responsive and interaction-state refinements.

### Options

- Replace the project-first list with status sections inspired literally by the
  reference image.
- Add a new combinable facet/popover system and dependency.
- Preserve single-select behavior and enrich the current Select presentation.

### Chosen approach

Keep the current filter state and matching logic. Add exhaustive typed display
metadata, render All first and grouped Status/Inactivity options with
descriptions, and show a bounded active label in the closed non-All trigger.
Retain a fixed icon/hit target, distinct focused-row styling, and the checked
indicator supplied by Radix.

### Trade-offs and risks

Single-select filtering remains less powerful than facets, but it matches the
established contract and avoids lifecycle/order regressions. Richer rows make
the menu taller, so copy stays short and the menu remains collision-aware.

### Verification

Test exhaustive metadata and the UI source contract, run existing behavioral
tests plus typecheck/build/workspace checks, then inspect closed/open states in
the live BB sidebar at normal and narrow widths.

## D-1 — Preserve filtering semantics

- Evidence: the existing pure matching helpers already cover all seven presets,
  age boundaries, project order, family context, and search composition.
- Options: replace filters with status sections; add combinable facets; rework
  only discovery and selected-state presentation.
- Decision: rework presentation only. The screenshot informs compact hierarchy
  and header actions, not a replacement of Dockside's project-first model.
- Trade-off: users still select one preset at a time, but the change is bounded
  and does not destabilize lifecycle/order behavior.

## D-2 — Extend the existing Select

- Evidence: Dockside already vendors a BB-compatible Radix Select with portal
  scoping, keyboard behavior, focus restoration, and themed primitives.
- Options: custom popover/radio list; add dropdown-menu; extend Select content.
- Decision: retain Select and render richer grouped option content.
- Trade-off: Select is single-choice by design, which matches current behavior;
  descriptions must remain concise to avoid an overly tall menu.

## D-3 — Show active state as text

- Evidence: tint alone is easy to miss and does not name the active constraint.
- Options: persistent filter chip elsewhere; dot/badge; label within trigger.
- Decision: All stays icon-only; non-All shows the selected label beside the
  icon with truncation and accessible title/label.
- Risk control: the label is bounded and yields space to the selection action.

## D-4 — Verify without broad data changes

- Evidence: the change is frontend presentation plus typed static metadata.
- Decision: cover metadata and source contract, retain existing behavioral
  tests, and require live browser inspection because visual evidence is enabled.
