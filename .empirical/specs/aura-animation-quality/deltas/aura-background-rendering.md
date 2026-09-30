# Aura Background Rendering

## Purpose

Provide configurable, persistent Aura backgrounds whose animated dithering can
balance smoothness, image sharpness, and GPU cost.

## ADDED Requirements

### Requirement: Selectable animation frame rate

Aura MUST let users select 15, 30, or 60 FPS for Capy dithering and MUST limit
WebGL draws to the selected rate.

#### Scenario: User chooses smoother motion

Given Capy dithering is enabled, when the user selects 60 FPS and applies the
background, then the setting is persisted and visible Aura surfaces render at
no more than 60 draws per second.

#### Scenario: Reduced motion is enabled

Given the operating system requests reduced motion, when Aura is configured for
60 FPS, then Aura renders a static frame and does not run a continuous loop.

### Requirement: Selectable render quality

Aura MUST offer Performance, Balanced, and Sharp render-quality tiers that map
to bounded drawing-buffer scales and apply to both generated and image-backed
dithering.

#### Scenario: User chooses sharper rendering

Given an Aura image uses Capy dithering, when the user selects Sharp quality,
then the live preview and applied background recreate the shader with the Sharp
drawing-buffer scale while retaining the framebuffer pixel cap.

### Requirement: Legacy settings compatibility

Aura MUST load settings and saved slots created before animation controls
existed, using 15 FPS and Balanced quality.

#### Scenario: Existing background is read

Given a stored settings object omits frame rate and render quality, when Aura
loads it, then validation supplies the conservative defaults without modifying
the image or other appearance values.

### Requirement: Saved background appearance

Saved slots MUST retain frame rate and render quality as part of their
appearance, while activation continues to preserve the global enabled, scope,
and dimmer toggles.

#### Scenario: Saved high-quality slot is activated

Given a slot was saved at 30 FPS and Sharp quality, when it is activated, then
those rendering selections become active together with the slot image and
appearance.
