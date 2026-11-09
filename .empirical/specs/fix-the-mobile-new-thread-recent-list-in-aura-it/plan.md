# Plan: Aura Mobile Recent List Surface

## Steps

1. **CSS** — in `plugins/aura/lib/background.ts`:
   - delete the `[data-root-compose-mobile-recents]` rules from the
     `@media (min-width:768px)` block (they target an element hidden there);
   - add `MOBILE_RECENTS`, a `@media (max-width:767px)` block with the card
     surface, non-sticky heading + hairline rule, hidden gradient stub, row
     dividers and hover/selected wash;
   - append it to `COMPOSE_LAYOUT`.
2. **Unit coverage** — `plugins/aura/test/lifecycle.test.ts`: assert the card
   rules live inside a `max-width:767px` media block and that the desktop
   `min-width:768px` block no longer mentions `data-root-compose-mobile-recents`.
   Keep the existing composer/scope assertions.
3. **Browser coverage** — `plugins/aura/test/mobile-composer.browser.mjs`:
   at 390x844 assert the recents section has a non-transparent background,
   `border-radius` >= 8px, a 1px border, the heading is not sticky, the second
   row has a 1px top divider, rows are transparent, no horizontal overflow, and
   the wallpaper is present; capture a light screenshot, then reload with
   `colorScheme: "dark"` and capture a dark screenshot. At 1440x1000 assert the
   mobile recents element is hidden and the composer stays centered.
4. **Release metadata** — bump `plugins/aura/package.json` to `0.2.8`, update
   the root `package-lock.json`, add the `0.2.8` CHANGELOG entry, and note the
   mobile Recent card in the README.
5. **Verify** — run `npm run check --workspace bb-plugin-aura`, install/reload
   the local plugin, run the browser check, and capture screenshots.
6. **Integrate and release** — push the branch, open the PR against `main`,
   wait for CI, merge it, then create and push the annotated `aura/v0.2.8` tag
   on the merge commit.

## Affected tests

- plugins/aura/test/lifecycle.test.ts
- plugins/aura/test/mobile-composer.browser.mjs

## Risks and fallbacks

- Host markup changes: target the stable `data-root-compose-mobile-recents`
  attribute and structural children; the browser check measures computed
  styles, so a rename fails loudly.
- A card surface can swallow the wallpaper; keep it inset (10px margins) and
  limited to the list area.
- Do not stage unrelated Empirical bookkeeping from reconcile or other plugins.
