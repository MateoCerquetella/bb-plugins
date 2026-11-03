# Aura Background Surface Specification

## Purpose

Keep Aura's decorative wallpaper from tinting BB's top bar unless the user
explicitly asks for it, with one persisted preference that applies consistently
across the New thread screen, existing conversations, and saved slots.

## Requirements

### Requirement: Opt-in top bar background
Aura SHALL keep its wallpaper out of BB's top bar band by default. A persisted
**Top bar background** preference SHALL let the user extend the wallpaper behind
that band instead, and SHALL remain global when switching saved slots or
resetting the background.

#### Scenario: Default keeps the top bar clean
- GIVEN Aura is enabled with an image or pattern
- AND the user has never changed the new preference
- WHEN the New thread screen or an existing conversation renders
- THEN the wallpaper begins below BB's top bar band
- AND the top bar keeps its normal theme surface.

#### Scenario: User opts the top bar in
- GIVEN Settings -> Aura is open
- WHEN the user checks **Top bar background** and applies the background
- THEN the wallpaper is painted behind the top bar band
- AND the choice survives a reload, a slot switch, and Reset to default.

#### Scenario: Shared editor surface
- GIVEN the Aura thread-panel action and the Settings section both mount the
  same `BackgroundEditor`
- WHEN the user opens either surface
- THEN both show the same **Top bar background** checkbox
- AND toggling it follows the same draft and Apply background flow.

#### Scenario: Older stored settings load
- GIVEN settings persisted before this preference existed
- WHEN Aura reads the snapshot
- THEN the preference defaults to off
- AND the rest of the background, slots, and overview still load.

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
