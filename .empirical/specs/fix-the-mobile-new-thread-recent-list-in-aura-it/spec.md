# Aura Mobile Recent List Surface

## Request

> That recent also is bad, I don't like it. Fix it, then make a new version
> release with a PR and merge it.

## Goal

On phones the New thread Recent list reads as a deliberate surface instead of
floating text over the wallpaper: a rounded, bordered, theme-colored card below
the wallpaper, a quiet "Recent" label above a hairline rule, and hairline
dividers between rows. Desktop stays exactly as it is.

## Acceptance Criteria

- [ ] [AC-1] Below 768px the Recent section renders as one themed card: inset
  from the screen edges, rounded corners, a border, an elevated translucent
  surface with backdrop blur, and a soft shadow. Text stays readable over a
  light or dark wallpaper.
- [ ] [AC-UI-1] [UI] The host's opaque sticky header band and its gradient stub
  are gone. The "Recent" label sits above a hairline rule inside the card and
  scrolls with the list, so no solid bar cuts across the wallpaper.
- [ ] [AC-UI-2] [UI] Rows are transparent with a hairline divider between
  adjacent rows; the empty/status row follows the same treatment. Hover and
  selected states remain visible without per-row card boxes.
- [ ] [AC-UI-3] [UI] At 390x844 the wallpaper is still visible above and around
  the card, the card has no horizontal overflow, and light and dark themes both
  render the card and text with usable contrast.
- [ ] [AC-2] At 768px and wider nothing changes: the New thread composer stays
  centered, the mobile recents element stays hidden, and the existing desktop
  chrome and wallpaper rules are untouched.
- [ ] [AC-3] With Aura disabled the emitted CSS adds no Recent styling, and the
  existing composer-centering scope from 0.2.7 is preserved.
- [ ] [AC-4] Focused tests cover the mobile-only scope and the card/header/row
  rules; real-browser evidence at 390x844 (light and dark) and 1440x1000 is
  captured with screenshots, and the Aura-focused check passes.
- [ ] [AC-5] Aura is version-bumped to 0.2.8 with a CHANGELOG entry and README
  note; the branch is pushed, a PR is opened against `main`, merged after CI
  passes, and an annotated `aura/v0.2.8` tag is pushed.

## Scope

`plugins/aura/lib/background.ts` recents CSS, focused unit and browser tests,
plus the Aura README, CHANGELOG, package version and lockfile. Reuse Aura's
existing intended recents chrome (the rules currently stranded in the desktop
media block) instead of inventing a new visual language.

## Non-goals

No changes to BB's host application or its thread-list components, no new
plugin, no changes to the composer or wallpaper rendering, no Activity overview
changes, no other plugins, and no npm publication.

## Risks

The recents element is a host component whose class names can change. Style it
through its stable `data-root-compose-mobile-recents` attribute and its first
child/`ul` structure, and keep the browser check measuring the rendered card
rather than only matching selectors. A card surface can hide the wallpaper the
plugin exists to show, so it is inset with visible margins and only covers the
list area.

## Verification

1. `npm run check --workspace bb-plugin-aura`.
2. Install and reload the local plugin, then in a real browser at 390x844
   (light and dark) assert the card surface, header rule, row dividers, and no
   horizontal overflow, and capture screenshots. At 1440x1000 assert the
   composer remains centered and the mobile recents element is hidden.
3. Fresh-context code review and independent browser QA.
4. Push, open the PR, wait for CI, merge, then tag `aura/v0.2.8`.

## Capability Deltas

See `deltas/aura-background-surface.md`.
