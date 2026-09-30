# Aura Animation Quality

## Request

> Add Aura settings for 15, 30, and 60 FPS and selectable WebGL render resolution/quality; persist both choices, apply them to animation timing and canvas resolution, update tests and documentation, and install locally for verification. Do not publish.

## Goal

Let Aura users choose how smooth and sharp the animated Capy dithering is,
while retaining a lower-cost default and preserving existing backgrounds.

## Acceptance Criteria

- [ ] [AC-1] Aura settings persist an animation frame-rate of 15, 30, or 60
  FPS and a render-quality tier of Performance, Balanced, or Sharp, including
  inside saved slots.
- [ ] [AC-2] Existing stored settings that lack the new fields load with 15 FPS
  and Balanced quality without a database migration or loss of image data.
- [ ] [AC-3] The WebGL animation limits draws to the selected frame rate and
  sizes its drawing buffer according to the selected quality tier, while
  retaining the existing image-size safety cap.
- [ ] [AC-4] Changing either option updates the live preview immediately and
  applying the background updates conversation and New thread surfaces.
- [ ] [AC-UI-1] [UI] When Capy dithering is selected, Aura exposes compact,
  accessible segmented controls for Animation speed and Render quality, with
  concise labels that remain usable at narrow settings-panel widths.
- [ ] [AC-5] Reduced-motion preference still prevents continuous animation
  regardless of the selected FPS, and hidden or non-intersecting surfaces do
  not schedule animation frames.
- [ ] [AC-6] Focused tests cover schema defaults, persistence, saved-slot
  behavior, and shader configuration; Aura typechecks, tests, builds, and is
  installed into the user's BB instance for local verification.

## Scope

- Extend Aura's validated background settings and defaults.
- Add speed and quality controls to Aura's existing settings panel.
- Parameterize the Capy shader loop and drawing-buffer resolution.
- Update focused tests, README, and changelog.
- Install the local plugin build in BB after verification.

## Non-goals

- Changing the dithering shader's visual algorithm or color palette.
- Removing reduced-motion, visibility, intersection, or WebGL failure guards.
- Supporting arbitrary numeric FPS or canvas-scale values.
- Publishing a release or modifying unrelated plugins.

## Risks

- 60 FPS and Sharp quality intentionally consume more GPU resources. The UI
  must communicate their relative cost and retain conservative defaults.
- A quality change recreates the WebGL effect; disposal must release the prior
  context and animation frame.
- Legacy rows and saved slots must parse through defaults before use.

## Verification

- Run Aura's focused unit and browser-contract tests selected by Empirical.
- Run Aura typecheck and production plugin build.
- Inspect the settings UI at desktop and narrow widths, and verify the preview
  canvas responds to speed and quality changes.
- Install the verified local package and confirm `bb aura status` reports the
  persisted selections.

## Capability Deltas

- `deltas/aura-background-rendering.md`
