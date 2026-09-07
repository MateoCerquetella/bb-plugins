# UI/UX Advisory

Specialist: ui-ux

Verdict: advisory

## Findings

### Finding 1
- Severity: high
- Category: information architecture
- Location: Save My Model settings
- Recommendation: Make machines the primary navigation and the native execution
  picker the primary action. Move the raw saved-record table behind a secondary
  disclosure so the surface explains what users can do instead of exposing
  storage internals first.

### Finding 2
- Severity: high
- Category: expectation setting
- Location: Save My Model description and helper copy
- Recommendation: State that the selection is saved for the chosen machine in
  this plugin. Do not imply that BB's root New Thread composer consumes it until
  a supported integration hook exists.

### Finding 3
- Severity: medium
- Category: responsive layout
- Location: machine selector
- Recommendation: Use a two-column rail/detail layout when space permits and a
  single native-styled select or horizontally compact list at narrow widths.
  Preserve machine name and connection state in both modes.

### Finding 4
- Severity: medium
- Category: state communication
- Location: disconnected and catalog-error states
- Recommendation: Keep disconnected machines selectable and their saved value
  visible, but disable configuration when BB cannot resolve a live catalog.
  Pair color with text; never rely on the status dot alone.

### Finding 5
- Severity: high
- Category: overlay hierarchy
- Location: Action Topbar launcher
- Recommendation: Mount above page/pane content but below host dialogs. Avoid an
  extreme z-index or browser top-layer element, which can cover approvals and
  confirmations. Verify the supplied marketplace overlap case plus a real host
  dialog.
