# Design: Native Modal Navigation Fixes

## Sidebar and Navigation

Keep `navPanel` as the route/component owner. The content script targets only
`[data-sidebar-navigation-item="host-monitor/host-monitor"]`, records each
matched element's original `hidden` value in a map, and sets `hidden = true`.
A child-list MutationObserver reapplies the rule when BB remounts navigation.
Disposal disconnects the observer and restores every connected element to its
recorded state. It never removes or reorders nodes and never selects by utility
class or visible text.

`Open Host Monitor` resolves that semantic wrapper and its first enabled
button. It closes the mini-modal and calls `button.click()`, using BB's existing
nav-panel action and client router. If unavailable it keeps the modal open and
renders an inline retry message; there is no `location.assign` fallback.

## Threshold Projection

Extend `MiniModalFleet` with `{ cpu, ram }` thresholds parsed from the existing
strict fleet response. Only finite numbers in 0–100 are accepted; invalid
values use the existing 90% passive defaults. Each CPU/RAM metric receives its
threshold. Fresh numeric values at or above it set `data-guide="over"` and an
aria-label such as “CPU 92.0%, above 90% guide.” Below-guide values include the
guide in their accessible label; unavailable values say unavailable. Disk stays
neutral in the mini-modal.

## BB-Native Polish

Use the host's card/popover/background/input/ring/foreground tokens; 6px panel
radii, 28px controls, restrained one-pixel borders, 11–13px typography, and
the same hover/focus states as BB sidebar actions. Give the header a compact
machine icon treatment, make host rows card-like rather than table strips, use
a muted guide legend, and keep the primary Open action visually consistent
with BB buttons. Maintain internal scrolling and viewport gutters at 390px.

The full dashboard keeps the host-owned nav shell and current layout. Refinement
is limited to consistent 6px radii/control sizing and clearer selected/editor
hierarchy; no information architecture or backend changes.

## Verification

Pure tests cover threshold parsing/labels and row-state bookkeeping helpers.
Source tests forbid hard navigation and broad selectors. Chromium seeds a
document marker, confirms the semantic row is hidden, opens the modal, observes
guide labels/treatment, activates Open, and proves the marker and document
remain while the dedicated URL/page loads. Existing fleet, persistence,
responsive, package, and workspace checks remain required.
