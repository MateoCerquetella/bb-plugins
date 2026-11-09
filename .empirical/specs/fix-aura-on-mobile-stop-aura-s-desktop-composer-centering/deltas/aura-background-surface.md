# Aura Background Surface

## Purpose

Keep Aura's decorative wallpaper and host-layout adjustments scoped to the
viewport where they belong, so the New thread composer stays reachable on a
phone and the desktop composition is unchanged.

## ADDED Requirements

### Requirement: Mobile New thread composer placement
Aura SHALL apply its centered New thread composition only at BB's desktop
breakpoint (`min-width: 768px`). Below that width it SHALL leave the host's
compact layout untouched so the native composer stays pinned to the bottom of
the viewport and the Recent list scrolls above it.

#### Scenario: Phone composer stays at the bottom
- GIVEN Aura is enabled and the viewport is 390x844
- WHEN the New thread screen renders
- THEN the composer is pinned to the bottom of the panel
- AND the Recent list scrolls above the composer
- AND the wallpaper is still painted behind the panel.

#### Scenario: Desktop composition is unchanged
- GIVEN Aura is enabled and the viewport is 1440x1000
- WHEN the New thread screen renders
- THEN the composer is centered in the upper half of the panel
- AND the recents offset, bottom spacer and fade remain hidden.

#### Scenario: Aura disabled
- GIVEN the user turns Aura off
- WHEN the New thread screen renders below 768px
- THEN Aura's emitted CSS applies no compact-layout override
- AND the host's native bottom composer remains in place.
