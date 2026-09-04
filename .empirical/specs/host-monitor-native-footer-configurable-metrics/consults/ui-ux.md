# UI/UX Specialist Advisory

- Specialist: ui-ux
- Verdict: advisory

## Findings

### Finding 1

- Severity: high
- Category: navigation
- Location: bottom-left sidebar entry
- Recommendation: use BB's host-rendered `sidebarFooterAction` with an Activity
  icon and `openSettings()` to reveal the dashboard in its plugin detail.
  Remove the `navPanel` row entirely; do not restore the earlier popup,
  DOM-injected monitor, or duplicated sidebar layout.

### Finding 2

- Severity: high
- Category: editing workflow
- Location: selected-host dashboard heading and editor
- Recommendation: make configuration an explicit in-page mode with Save and
  Cancel. Keep the draft stable through realtime telemetry updates and retain
  it after save errors so the user never loses a multi-step edit.

### Finding 3

- Severity: medium
- Category: information architecture
- Location: configured panel grid
- Recommendation: preserve the fleet overview first, then one clearly named
  selected-host dashboard. Render panels in saved order and make each editor
  row mirror the resulting dashboard order.

### Finding 4

- Severity: medium
- Category: native visual language
- Location: toolbar, panels, and editor controls
- Recommendation: retain BB's compact control heights, host color tokens,
  restrained borders/radii, muted secondary labels, and focus-visible rings.
  Use Grafana's dense dashboard workflow as inspiration, not its branding.

### Finding 5

- Severity: medium
- Category: responsive accessibility
- Location: 390px layout
- Recommendation: stack editor rows, keep a text label or accessible name on
  every reorder/remove action, avoid horizontal page scrolling, and represent
  unavailable offline metrics with text rather than disabling configuration.
