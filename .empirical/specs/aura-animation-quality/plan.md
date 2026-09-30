# Plan: Aura Animation Quality

## Task 1: Settings contract and persistence

- Update `plugins/aura/lib/model.ts` with `fps` and `quality` enums/defaults.
- Ensure `server.ts` slot activation/reset paths preserve the new appearance
  values while keeping global toggles behavior unchanged.
- Add model/server tests for legacy parsing, new values, and slot round trips.

## Task 2: Shader scheduler and resolution

- Update `plugins/aura/lib/capy-effect.ts` to pass settings into the shader
  mount, select the frame interval, and map quality tiers to bounded scales.
- Keep reduced-motion, visibility, intersection, context-loss, and disposal
  guards unchanged.
- Add focused tests for the exported quality mapping or deterministic helper.

## Task 3: Settings UI and documentation

- Add accessible segmented controls with `aria-pressed` to `app.tsx`.
- Add compact responsive styles in `app.css` and helper text describing GPU
  cost.
- Update README and CHANGELOG with the new controls and defaults.

## Task 4: Verification and local install

- Run Aura focused tests, typecheck, and build.
- Install the local Aura plugin in BB and reload it.
- Confirm persisted selections with `bb aura status --json`.
- Capture UI/browser evidence without publishing.
