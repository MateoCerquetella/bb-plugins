# UI/UX Specialist Advisory

- Specialist: ui-ux
- Verdict: advisory

## Findings

### Finding 1

- Severity: high
- Category: navigation
- Location: main BB sidebar
- Recommendation: remove the Host Monitor page row completely and retain one
  host-rendered bottom Activity icon. Use `openSettings()` so activation follows
  BB's focus, tooltip, keyboard, and navigation behavior.

### Finding 2

- Severity: high
- Category: visual hierarchy
- Location: monitor settings section
- Recommendation: preserve the supplied reference's scan order—summary and
  machine selection, current cards, large history charts, then supporting
  facts—while using BB theme tokens rather than copying the reference palette.

### Finding 3

- Severity: medium
- Category: responsive layout
- Location: 390px monitor/editor
- Recommendation: make charts full-width, stack editor rows and controls, keep
  readable minimum chart heights, and prevent document-level horizontal
  overflow.

### Finding 4

- Severity: medium
- Category: feedback
- Location: host and configuration failures
- Recommendation: retain textual inline states and explicit Save/Cancel. Do not
  revive badges, toasts, popup surfaces, or destructive controls from the older
  Machine Monitor implementation.
