# Decisions: Usage Tracker Claude Credits

## D-001: Render the normalized cost instead of probing Claude

Status: Accepted

### Evidence

- `UsageWindow.cost` already carries validated cents from BB.
- `formatCost()` already produces localized USD copy.

### Options

1. Execute or parse `claude /usage` from the plugin.
2. Render BB's existing normalized cost field.

### Chosen approach

Choose option 2 and add no new trust boundary.

### Trade-offs and risks

Credits appear only when the running BB/provider bridge reports them, which is
truthful and avoids inventing unavailable data.

### Verification

Focused renderer contracts, Usage Tracker tests/typecheck/build, and live data
shape tests.

## D-002: Keep credits in expanded details

Status: Accepted

### Evidence

- The compact strip is intentionally percentage-first and width constrained.
- Expanded rows already own percentage, reset, and per-window metadata.

### Options

1. Add dollar text to every compact provider button.
2. Add one readable metadata line to expanded windows with cost data.

### Chosen approach

Choose option 2; it adds no control or focus stop.

### Trade-offs and risks

Users open Claude details to see dollars, preserving the compact layout.

### Verification

Source contract and accessible DOM-text assertions plus visual CSS inspection.
