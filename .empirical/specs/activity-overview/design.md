# Activity Overview Design

## Approach

Register the existing component with `app.slots.homepageSection` so the host
places it below the New Thread composer. Retain Settings and thread actions.
Test the actual app entry registration as well as the component.

Implement a standalone React plugin using the existing BB SDK app entry pattern.
Keep the data model in a pure module so selector changes are deterministic and
unit-testable. Render a dense overview surface with host theme tokens, semantic
sections, and CSS grid breakpoints.

## Data flow

The app owns `period` and `repository` state. A pure `getOverview(period,
repository)` function returns metrics, heatmap cells, pattern summaries, and
attention items. The UI derives all displayed content from that value, so
changing either select updates the whole view without network effects.

## Risks and mitigations

- Static data could look misleading: label the surface as local sample activity
  in the README and keep the data module easy to replace with a future adapter.
- Dense heatmap can overflow narrow screens: use a horizontally scrollable
  calendar region and collapse the supporting grid below 720px.
- Theme differences can reduce contrast: use BB semantic CSS variables and
  explicit `:focus-visible` outlines.
