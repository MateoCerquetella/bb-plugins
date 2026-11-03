# Design: Aura Mobile New Thread Composer

## Problem

Aura's content script always emits `COMPOSE_CENTER`, which turns BB's compact
New thread layout into a desktop-centered composition:

- `root-compose-compact-composer` loses its native `position: absolute;
  bottom: 0` and is ordered first with `min-height: min(45dvh, 440px)`;
- `root-compose-compact-home` becomes an auto-scrolling flex column;
- the scroll viewport, content, recents offset, bottom spacer and fade are
  overridden or hidden.

Measured at 390x844 against the installed plugin: native composer y=665 (bottom
pinned), with Aura y=100 (top). The composer ends up under the top bar, away
from the thumb, and the lower half of the screen is empty wallpaper.

BB's own mobile components are gated by `md:` (768px). The compact bottom
composer is the host's design for widths below that breakpoint.

## Change

In `plugins/aura/lib/background.ts`, wrap the rules of `COMPOSE_CENTER` in
`@media (min-width: 768px)`. `COMPOSE_LAYOUT` keeps the same concatenation, so
the existing desktop chrome block (already `min-width: 768px`) is unchanged.

```
COMPOSE_CENTER = `
@media (min-width: 768px) {
  ...existing centered rules...
}
`;
```

No JavaScript viewport detection and no hand-written mobile restore rules.
Below 768px the emitted CSS contains no selector that touches the compact
layout, so the host's native absolute bottom composer, spacer and fade stay
exactly as shipped by BB. Aura still paints the wallpaper on the panel itself
(`backgroundRules` + Capy layer), which is independent of the layout override.

## Behavior matrix

| Viewport | Composer | Recents | Wallpaper |
| --- | --- | --- | --- |
| < 768px | native, absolute bottom | scrolls above composer | painted, half mode fades at 50% |
| >= 768px | centered, order first, min 45dvh | offset/spacer/fade hidden, card chrome | unchanged |
| Aura disabled, any | native (only `COMPOSE_CENTER` is emitted, now desktop-only) | native | none |

## Verification

- Unit: assert the emitted compose override is inside a
  `min-width: 768px` media block and that no compact-layout property is emitted
  outside it; keep the existing content-script tests green.
- Real browser: install the local plugin, then Playwright at 390x844 asserts
  the composer bottom is pinned to the panel bottom, the Recent list scrolls
  above it, the wallpaper layer exists, and there is no horizontal overflow.
  At 1440x1000 assert the composer is centered and the recents spacer is
  hidden. Screenshots for both.

## Files

- `plugins/aura/lib/background.ts` (compose CSS)
- `plugins/aura/test/lifecycle.test.ts` (breakpoint assertion)
- `plugins/aura/test/mobile-composer.browser.mjs` (real mobile UI evidence)
- `plugins/aura/README.md`, `plugins/aura/CHANGELOG.md`, `package.json`
