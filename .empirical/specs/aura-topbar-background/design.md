# Design: Aura top bar background

## Root cause

BB renders the page top bar as a `header` inside Aura's decorated panel
(`#root-compose-main-panel` or `#thread-detail-timeline-panel`). The host gives
that header a 92%-opaque `bg-surface-scrim`, and Aura prepends its
`.aura-capy-layer` at `inset: 0` behind it. The wallpaper therefore shows
through the top bar band. The wallpaper also occupies the equivalent band on
the New thread screen, where the header is not rendered but the host reserves
the same `--bb-app-chrome-row-height` space.

## Approach

1. Add `topbarBackground: boolean` (default `false`) to `settingsSchema` and
   `defaults` in `lib/model.ts`. The default keeps the top bar clean for
   existing users and new installs.
2. Treat it as a global preference, like `enabled`, `newThreadOnly`,
   `dimmerEnabled`, and `activityOverview`: exclude it from the "appearance"
   comparison used to preserve an active slot, and carry it across
   `activateSlot`, `reset`, and legacy settings through the schema default.
3. In `lib/background.ts`, append a CSS rule scoped to the active target:
   when the preference is off, `.aura-capy-layer { top:
   var(--bb-app-chrome-row-height, 48px); }`; when on, keep `top: 0`.
   Emit it after `CAPY_CSS` so the layer's base `inset: 0` cannot win on cascade
   order even if specificity changes. Clipping the decorative layer is safer
   than restyling the host header, because it cannot alter host text, borders,
   controls, or drag behavior and it also covers the New thread band.
4. Add a **Top bar background** checkbox in the settings fieldset, next to the
   existing scope/half-wallpaper checkboxes. It edits the draft and saves with
   **Apply background**, matching the existing appearance controls and slot
   workflow.
5. Bump `plugins/aura/package.json` to `0.2.6`, update `package-lock.json`,
   `CHANGELOG.md`, and the README install example. Add focused tests for the
   default, slot preservation, reset preservation, legacy loading, the emitted
   CSS rule, and the shared Settings/thread-panel registration.

## Files

- `plugins/aura/lib/model.ts` — schema and default.
- `plugins/aura/lib/background.ts` — CSS rule for the layer offset.
- `plugins/aura/app.tsx` — Settings -> Aura checkbox.
- `plugins/aura/app.css` — optional spacing only if the reusable `.aura-scope`
  style does not already cover the new row.
- `plugins/aura/server.ts` — slot/reset preference handling if not already
  covered by the shared helper.
- `plugins/aura/README.md`, `CHANGELOG.md`, `package.json`, root
  `package-lock.json`.
- `plugins/aura/test/server.test.ts`, `test/lifecycle.test.ts`,
  `test/registration.test.ts` — behavior and shared-surface contract.

## Trade-offs

- Clipping at the top bar height leaves a theme-colored band at the top of the
  wallpaper on New thread when the preference is off. That is the requested
  "no wallpaper behind the top bar" result and avoids guessing at the host's
  scrim color.
- The host token may change. Use the existing token with a 48px fallback and
  verify in the installed UI.
- The checkbox saves on Apply, not immediately. This keeps the draft/apply/save
  slot model intact and avoids a second RPC path; the user already expects to
  press Apply for the surrounding appearance controls.

## Verification

- `npm run check --workspace bb-plugin-aura` from the repository root.
- Install and reload the local plugin; inspect Settings -> Aura and the real
  thread/New-thread UI with the preference off and on at desktop and narrow
  widths.
- Reopen a saved slot and **Reset to default** to confirm the preference stays.
- Review the exact diff and merge the PR only after CI is green.
