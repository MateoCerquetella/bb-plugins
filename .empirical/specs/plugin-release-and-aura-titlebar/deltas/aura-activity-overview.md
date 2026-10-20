# Aura Activity Overview Delta

## ADDED Requirements

### Requirement: Keep wallpaper below the framed title bar

Aura SHALL start its wallpaper below the desktop title bar when BB's framed
layout places the main panel at the top of the window. Thread and new-thread
backgrounds SHALL retain their existing behavior below that boundary.

#### Scenario: Framed macOS layout

- **GIVEN** the BB window uses the framed desktop title-bar layout
- **WHEN** Aura is enabled on a thread or the new-thread page
- **THEN** the title-bar area uses the host background
- **AND** Aura begins at the content boundary below it

#### Scenario: Layout has no framed title bar

- **GIVEN** the host layout exposes no title-bar inset
- **WHEN** Aura is enabled
- **THEN** the wallpaper keeps its existing full-panel position

#### Scenario: Regression is closed

- **WHEN** automated and browser verification prove both layouts
- **AND** the reviewed fix merges
- **THEN** repository issue #92 may be closed with the merge evidence
