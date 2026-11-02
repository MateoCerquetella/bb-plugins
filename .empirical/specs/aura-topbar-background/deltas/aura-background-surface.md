# Aura Background Surface

## Purpose

Keep Aura's decorative wallpaper from tinting BB's top bar unless the user
explicitly asks for it, with one persisted preference that applies consistently
across the New thread screen, existing conversations, and saved slots.

## ADDED Requirements

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

#### Scenario: Older stored settings load
- GIVEN settings persisted before this preference existed
- WHEN Aura reads the snapshot
- THEN the preference defaults to off
- AND the rest of the background, slots, and overview still load.
