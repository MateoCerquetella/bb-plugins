# Decisions: Aura Mobile New Thread Composer

## D-001: Scope the compose override with a media query

Status: Accepted

### Evidence

Live 390x844 inspection of the installed Aura 0.2.6 against BB 0.40:

- Native host layout: `[data-testid="root-compose-compact-composer"]` is
  `position: absolute; bottom: 0` at y=665 in an 844px viewport, with the
  `root-compose-compact-bottom-spacer` and fade present.
- With Aura enabled the same composer is `position: relative` at y=100, the
  host bottom spacer and fade are `display: none`, and the Recent list starts
  at y=494. The override comes from `COMPOSE_CENTER` in
  `plugins/aura/lib/background.ts`, which is emitted for every viewport.
- BB's own mobile components use `md:hidden` / the 768px `md` breakpoint, so
  768px is the host boundary between the compact bottom composer and the
  desktop composition.

### Options

1. Wrap `COMPOSE_CENTER` rules in `@media (min-width: 768px)` so the host keeps
   its compact layout below 768px.
2. Emit the existing override plus a second `max-width: 767px` block that
   restores every host property by hand.
3. Detect the viewport in JavaScript and swap the emitted CSS.

### Chosen approach

Option 1. It is the smallest complete change: the desktop rules are unchanged,
the host owns the mobile layout, and the emitted CSS cannot drift from the host
by restating native values.

### Trade-offs and risks

The breakpoint is duplicated from the host. Keeping it equal to BB's `md`
boundary (768px) means the override is active only where the desktop
composition applies. If BB changes the boundary, only the scoping constant
needs to move.

### Verification

Unit test asserts the compose override is inside a `min-width: 768px` block and
that no compact-layout property is emitted outside it. Real-browser checks at
390x844 and 1440x1000 assert composer position and capture screenshots.
