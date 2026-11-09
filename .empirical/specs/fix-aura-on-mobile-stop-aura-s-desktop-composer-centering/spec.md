# Aura Mobile New Thread Composer

## Request

> Fix Aura for mobile: move the New thread composer to the bottom for easy
> access, and fix the mobile UI too.

## Goal

On phones and other narrow viewports, Aura leaves BB's native compact New
thread layout alone: the composer stays pinned to the bottom of the viewport
where a thumb can reach it, the Recent list scrolls above it, and the wallpaper
and half-wallpaper rendering still work. The desktop centered composition stays
exactly as it is at BB's `md` breakpoint (768px) and wider.

## Acceptance Criteria

- [ ] [AC-1] The content-script CSS that reorders and expands the compact New
  thread layout (composer first, `min-height`, hidden recents offset, spacer and
  fade) applies only at `min-width: 768px`. Below that width Aura emits no rule
  that changes BB's compact layout, so the composer keeps the host's
  `position: absolute; bottom: 0` placement.
- [ ] [AC-UI-1] [UI] At a 390x844 mobile viewport the New thread composer sits
  at the bottom of the panel (its bottom edge within 2px of the panel bottom)
  and its top starts below 60% of the panel height, instead of near the top.
- [ ] [AC-UI-2] [UI] The Recent list scrolls above the composer, the native
  bottom spacer and fade are present, and no horizontal overflow appears at
  390px.
- [ ] [AC-UI-3] [UI] The wallpaper still paints behind the New thread panel on
  mobile, half-wallpaper still fades out at the midpoint, and the composer keeps
  its readable host surface over the wallpaper.
- [ ] [AC-2] At 768px and wider the existing centered composition is unchanged:
  the composer is ordered first with `min-height: min(45dvh, 440px)`, the
  recents offset/spacer/fade stay hidden, and the desktop recents card chrome
  still applies.
- [ ] [AC-3] Aura remains enabled/disabled and New-thread-only behavior
  unchanged; with Aura disabled the emitted CSS also leaves the mobile layout
  native.
- [ ] [AC-4] Focused tests cover the breakpoint scope, `npm run check
  --workspace bb-plugin-aura` passes, and the installed plugin is verified in
  the real browser at mobile and desktop widths with screenshots.
- [ ] [AC-5] README/CHANGELOG describe the mobile composer placement and the
  patch version is bumped consistently.

## Scope

`plugins/aura/lib/background.ts` compose-layout CSS, focused tests under
`plugins/aura/test`, the Aura README and CHANGELOG, and the package patch
version. Reuse the existing `COMPOSE_CENTER`/`COMPOSE_LAYOUT` constants and
BB's own `md` breakpoint.

## Non-goals

No changes to BB's host application or its mobile components, no new plugin, no
redesign of the Aura settings page, no change to the Activity overview data or
layout, no image/storage changes, and no publication.

## Risks

BB could rename its compact layout test ids or change its `md` breakpoint. The
media query matches the host's 768px `md` boundary so the override can only be
active where the desktop composition is expected. Hiding the override on mobile
must not leave the panel unscrollable; the browser check scrolls the Recent list
and measures the composer position.

## Verification

1. `npm run check --workspace bb-plugin-aura` (typecheck, unit tests, build).
2. Install and reload the local plugin (`bb plugin install ./plugins/aura`,
   `bb plugin reload aura`).
3. Playwright against the installed UI: at 390x844 assert the composer bottom is
   pinned to the panel bottom, the Recent list scrolls above it, no horizontal
   overflow, and the wallpaper layer is present; capture a screenshot. At
   1440x1000 assert the centered composition is unchanged; capture a
   screenshot.
4. Review the exact branch diff and report the actual checks that ran.

## Capability Deltas

See `deltas/aura-background-surface.md`.
