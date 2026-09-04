# UI/UX Specialist Advisory

- Specialist: ui-ux
- Verdict: advisory

## Findings

### Finding 1

- Severity: high
- Category: interaction hierarchy
- Location: bottom footer icon and modal
- Recommendation: preserve the two distinct depths: quick fleet health in the
  anchored mini-modal, advanced history/configuration only after an explicit
  Open Host Monitor action.

### Finding 2

- Severity: high
- Category: modal behavior
- Location: compact telemetry modal
- Recommendation: anchor above the footer icon, label it as a dialog, include a
  visible close control, close on Escape/outside activation, and return focus.
  Do not make it draggable or turn it into an alert surface.

### Finding 3

- Severity: medium
- Category: information density
- Location: modal machine rows
- Recommendation: keep each machine to name/state plus CPU/RAM/disk. Use text
  for offline/error states and cap height with internal scrolling; avoid charts
  in the compact modal.

### Finding 4

- Severity: medium
- Category: full-page continuity
- Location: Open Host Monitor destination
- Recommendation: retain the existing dense BB-token dashboard and put the
  configuration editor there, not in the modal or plugin Settings.
