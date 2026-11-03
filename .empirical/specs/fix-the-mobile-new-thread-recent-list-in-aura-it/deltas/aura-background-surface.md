# Aura Background Surface

## ADDED Requirements

### Requirement: Mobile Recent list surface
At phone widths Aura SHALL render BB's New thread Recent list as one themed
surface card over the wallpaper, with a quiet heading above a hairline rule and
hairline dividers between rows.

#### Scenario: Recent list on a phone
- GIVEN Aura is enabled with a wallpaper and the viewport is 390x844
- WHEN the New thread screen renders
- THEN the Recent list appears in a rounded, bordered, themed card inset from
  the screen edges
- AND the wallpaper remains visible above and around the card
- AND the "Recent" heading sits above a hairline rule instead of an opaque bar.

#### Scenario: Rows read as a list
- GIVEN the Recent card is visible
- WHEN it contains several threads
- THEN adjacent rows are separated by a hairline divider
- AND rows have no individual card background in either theme.

#### Scenario: Desktop stays unchanged
- GIVEN the viewport is 1440x1000
- WHEN the New thread screen renders
- THEN the composer remains centered under the existing desktop composition
- AND the mobile Recent card rules do not apply.
