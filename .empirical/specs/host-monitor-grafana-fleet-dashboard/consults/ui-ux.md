# UI/UX Consult

- specialist: `ui-ux`
- verdict: `advisory`

## Findings

### 1. Define selection behavior separately from filtering

- severity: medium
- category: interaction
- location: Frontend composition, toolbar and fleet grid
- recommendation: Use a labeled search field to filter cards and make each card the explicit machine-selection control. Show a persistent selected treatment, preserve selection when filtering when possible, and choose the first connected machine only when no prior selection exists. Avoid a second machine dropdown that duplicates the card grid.

### 2. Preserve fleet visibility at scale

- severity: medium
- category: information architecture
- location: Frontend composition, responsive fleet strip/grid
- recommendation: Put fleet cards in a bounded, independently scrollable or progressively disclosed region with a visible match count and clear empty result. Keep offline, stale, loading, and failed cards in the same filtered collection; do not hide them behind a connected-only default.

### 3. Make state legible without relying on color

- severity: high
- category: accessibility
- location: Frontend composition and notification/privacy boundary
- recommendation: Pair every connection, freshness, failure, and threshold state with concise text and/or an icon plus an accessible label. Use threshold color only as reinforcement; borders and chart guide lines alone are insufficient. Ensure controls, cards, and charts have keyboard-visible focus and theme-safe contrast.

### 4. Specify responsive chart behavior

- severity: medium
- category: responsive layout
- location: Frontend composition, 760px/460px/390px behavior
- recommendation: At 390px, stack panels in one column, keep each chart at a stable minimum height, reduce axis density, and expose latest/min/max values in text outside the canvas. Let the page scroll vertically; do not require gestures inside a chart to reach later content. Keep the toolbar controls full-width and in the order machine search, range, refresh.

### 5. Clarify refresh and historical-gap feedback

- severity: low
- category: system feedback
- location: Toolbar and selected-machine history panels
- recommendation: While refresh is coalesced, disable the refresh control, retain existing data, and show a compact inline “Refreshing…” state with last-updated time. Render collection gaps as breaks rather than zero values and give unavailable panels a short reason plus the last successful timestamp when known.
