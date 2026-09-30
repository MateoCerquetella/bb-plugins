# Design: Aura Animation Quality

## Context

Aura stores one validated `BackgroundSettings` object for the active
background and duplicates that object into saved slots. The app-side
`CapyPreview` and content-script background both call `mountCapyEffect`.

## Approach

1. Add `fps` and `quality` enums to `BackgroundSettings`, with defaults
   `15` and `balanced`. Zod `.default()` makes legacy rows compatible.
2. Render two compact button groups in the existing Aura controls. They use
   native buttons with `aria-pressed`, and appear only when Capy dithering is
   active. Each change updates the draft and the preview immediately; Apply
   persists it through the existing RPC and slot path.
3. Pass settings into `mountShader`. Compute a quality scale from
   `performance=1/4`, `balanced=1/3`, `sharp=1/2`, then clamp image-backed
   buffers to the existing 2,073,600-pixel cap.
4. Replace the hard-coded 15 FPS interval with `1000 / fps`. Preserve the
   reduced-motion, hidden-document, visibility, intersection, and context-loss
   guards.
5. Keep shader disposal on every effect/settings/image change so quality
   changes cannot leave old RAF loops or WebGL contexts alive.

## UI Direction

Industrial/utilitarian settings panel with a single differentiator: paired
segmented controls make the smoothness/sharpness trade-off visible at a glance.
Existing Aura color, spacing, and typography tokens remain unchanged.

## Failure Handling

Invalid persisted values fail schema validation as before; missing new values
are filled by defaults. WebGL failures continue to fall back to the source
image/gradient. The selected values never bypass the existing image-size cap.

## Verification

- Unit tests assert defaults and schema parsing of legacy objects.
- Browser-contract tests assert controls, `aria-pressed`, preview changes, and
  narrow-width layout.
- Typecheck and production build prove SDK compatibility.
