# Plan: Aura mobile New thread composer

## Steps

1. **Scope the compose override** — in `plugins/aura/lib/background.ts`, wrap
   the whole `COMPOSE_CENTER` template in
   `@media (min-width: 768px) { … }`. Leave every rule inside it untouched,
   and leave `COMPOSE_LAYOUT`'s existing `min-width: 768px` chrome block as is.
2. **Unit coverage** — in `plugins/aura/test/lifecycle.test.ts`, assert the
   emitted CSS contains the compose override only inside a
   `@media (min-width: 768px)` block: the selector/property pair
   (`root-compose-compact-composer` + `order:-1`) must appear after the media
   opener and before its closing brace, and must not appear when the media
   block is stripped. Verify the disabled-Aura branch emits the same scoped
   layout.
3. **Real-browser check** — add
   `plugins/aura/test/mobile-composer.browser.mjs`, modeled on
   `half-wallpaper.browser.mjs` (route the Aura RPC with a fixture snapshot):
   - 390x844: composer bottom within 2px of the panel bottom, composer top
     below 60% of panel height, recents visible above the composer, no
     horizontal overflow, wallpaper layer present; screenshot
     `new-thread-mobile.jpg`.
   - 1440x1000: composer centered (top above 45% of panel height), the recents
     bottom spacer hidden; screenshot `new-thread-desktop.jpg`.
4. **Docs and version** — bump `plugins/aura/package.json` to `0.2.7`, update
   the root `package-lock.json`, add a `0.2.7` CHANGELOG entry, and note in the
   README that the composer stays at the bottom on mobile.
5. **Verify** — run `npm run check --workspace bb-plugin-aura`, install and
   reload the local plugin (`bb plugin install ./plugins/aura`,
   `bb plugin reload aura`), run the new browser check against the installed
   UI, capture screenshots, then review the exact diff.

## Affected tests

- plugins/aura/test/lifecycle.test.ts
- plugins/aura/test/mobile-composer.browser.mjs
- plugins/aura/test/half-wallpaper.browser.mjs

## Risks and fallbacks

- BB may rename the compact layout test ids. The browser check asserts
  positions rather than only selectors, so a rename fails loudly instead of
  silently restoring the bug.
- The `md` boundary is duplicated. If BB changes it, only the media query in
  `COMPOSE_CENTER` moves; no other rule depends on the value.
- Do not stage unrelated pre-existing changes in this checkout.
