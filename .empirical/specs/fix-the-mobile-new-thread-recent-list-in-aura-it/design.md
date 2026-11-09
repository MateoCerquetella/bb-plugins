# Design: Aura Mobile Recent List Surface

## Problem

At phone widths the Recent list (`[data-root-compose-mobile-recents]`) is
painted directly on Aura's wallpaper:

- the sticky host header paints an opaque `var(--background)` band across the
  wallpaper;
- rows are transparent, so titles sit on the dithering texture with no
  separation;
- Aura's intended recents chrome already exists in `lib/background.ts`, but it
  sits inside `@media (min-width:768px)` while the element is `md:hidden`, so it
  never applies.

## Change

1. Remove the `[data-root-compose-mobile-recents]` rules from the desktop media
   block in `lib/background.ts` (they target an element hidden at that width).
2. Add `MOBILE_RECENTS`, a `@media (max-width:767px)` block appended to
   `COMPOSE_LAYOUT`, that turns the section into one card:

   ```css
   [data-root-compose-mobile-recents] {
     margin:0 10px 8px; padding:10px 8px 8px;
     border:1px solid color-mix(in oklab,var(--border) 70%,transparent);
     border-radius:16px;
     background:color-mix(in oklab,var(--background) 94%,transparent);
     box-shadow:0 10px 30px color-mix(in oklab,var(--foreground) 8%,transparent);
     backdrop-filter:blur(16px) saturate(.88);
   }
   ```

   The heading becomes a normal-flow flex row (no sticky band) with the
   `Recent` label at 0.75rem/600 and a hairline gradient rule after it; the
   host's gradient stub is hidden. Rows stay transparent and adjacent rows get
   a `border-top` hairline; hover/selected rows get a 5% foreground wash with an
   8px radius. The status/empty row follows the row rules.
3. Keep the paper trail: the wallpaper layer and the 0.2.7 composer scoping are
   untouched.

## Behavior matrix

| Viewport | Recent list | Wallpaper | Composer |
| --- | --- | --- | --- |
| < 768px | inset card, heading rule, row dividers | visible above/around the card | native, bottom pinned |
| >= 768px | element hidden (host `md:hidden`) | unchanged | centered |

## Verification

- Unit: assert the recents card rules live only in the `max-width:767px` block
  and that the desktop block no longer mentions `data-root-compose-mobile-recents`.
- Browser at 390x844 (light + dark): computed card radius/border/opaque surface,
  heading not sticky and its band gone, second row has a 1px top divider, rows
  transparent, no horizontal overflow, wallpaper layer present; screenshots.
- Browser at 1440x1000: mobile recents hidden, composer still centered.
- Release: version 0.2.8, changelog, README, PR, merge, annotated
  `aura/v0.2.8` tag.

## Files

- `plugins/aura/lib/background.ts`
- `plugins/aura/test/lifecycle.test.ts`
- `plugins/aura/test/mobile-composer.browser.mjs`
- `plugins/aura/package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`
