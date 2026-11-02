# Plan: Aura top bar background

## Steps

1. **Schema and defaults** — add `topbarBackground: z.boolean().default(false)`
   to `plugins/aura/lib/model.ts` and `false` to `defaults`.
2. **Global preference persistence** — in `plugins/aura/server.ts`, add the key
   to the `appearance()` destructuring so changing only this preference keeps
   the active slot, and carry it through `activateSlot` and `reset`.
3. **Rendering** — in `plugins/aura/lib/background.ts`, emit a rule scoped to
   the active target:
   - off: `… .aura-capy-layer { top: var(--bb-app-chrome-row-height, 48px); }`
   - on: `… .aura-capy-layer { top: 0; }`
   Keep the rule out of the preview scene.
4. **Settings UI** — add a **Top bar background** checkbox to the controls
   fieldset in `plugins/aura/app.tsx`, with a short description, bound to the
   draft via `change("topbarBackground", …)`.
5. **Docs and version** — bump `plugins/aura/package.json` to `0.2.6`, update
   the root `package-lock.json`, add a `0.2.6` CHANGELOG entry, and update the
   README install example and behavior notes.
6. **Tests** — extend `test/server.test.ts` (default, apply round-trip, slot
   switch, reset, legacy settings) and `test/lifecycle.test.ts` (emitted CSS
   rule off/on). Keep existing assertions intact.
7. **Verify** — run the Aura-focused check, install/reload the local plugin,
   inspect the real Settings UI and thread/New-thread top bar, capture
   screenshots, then review the diff.
8. **Deliver** — commit only the Aura implementation, docs, version, lockfile,
   and this feature's Empirical artifacts; push the branch, open a PR against
   `main`, watch CI, and merge when green.

## Affected tests

- plugins/aura/test/server.test.ts
- plugins/aura/test/lifecycle.test.ts
- plugins/aura/test/registration.test.ts

## Risks and fallbacks

- If the host header is not inside the decorated panel in a future BB build,
  the layer offset still removes wallpaper from the reserved band. Recheck
  selectors on upgrade.
- If the top bar token is absent, the 48px fallback matches the installed BB
  0.48 chrome row height.
- Do not stage unrelated pre-existing `.empirical` deletions or other plugin
  changes already present in this checkout.
