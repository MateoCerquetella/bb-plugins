# Dockside Mobile Thread Navigation

## Request

> Make a bb plugin for bb mobile to have like arrows or tinder stylrer to go strong it the threads more easily. You teasesrch and do it don’t ask me

## Goal

Extend Dockside with one-thumb mobile navigation across active and unread
threads in every project through previous/next controls and horizontal swipes.

## Acceptance Criteria

- [ ] [AC-1] The current thread plus visible, non-archived active and unread threads across every project are ordered by latest attention with deterministic fallbacks.
- [ ] [AC-UI-1] [UI] At widths up to 767px, a compact strip above the composer offers accessible 44px previous/next arrows, title and position. Desktop is unchanged.
- [ ] [AC-UI-3] [UI] The strip shows the current thread's live BB status using the host-provided accessible indicator label, with "Idle" when the host reports no indicator. Status changes update without navigation or message inspection.
- [ ] [AC-UI-2] [UI] A deliberate horizontal swipe on the strip changes one thread; vertical movement, cancellation, short gestures and gestures outside the strip never navigate.
- [ ] [AC-2] Navigation wraps from the last queue item to the first and from
  the first to the last. Loading, errors, and singleton lists remain safe;
  stale requests cannot change the current thread.
- [ ] [AC-UI-4] [UI] Every queued thread shows its project initial using Dockside's effective project color, including custom colors synchronized through Dockside settings.
- [ ] [AC-3] Dockside owns the implementation, tests and documentation. The standalone Thread Mobile package and root catalog entry are removed.
- [ ] [AC-4] The existing Dockside v0.1.5 installation is removed, the local
  v0.1.6 build is installed and running, and the immutable `dockside/v0.1.6`
  Git release is created from the verified commit and pushed.

## Scope
Dockside app registration, mobile navigation components and helpers, Dockside
project color hook, focused tests and documentation, root catalog/lockfile
cleanup, local replacement install, immutable v0.1.6 tag/release, and live
mobile browser verification.

## Non-goals
No archive/delete/vote gesture, no native BB patch, no desktop UI replacement,
no message-content capture, no inferred completion state, and no second
standalone mobile-navigation plugin.

## Risks
Mobile composer layouts and SDK mounting support must be verified. Gestures
must not steal vertical scrolling or native edge-back gestures. Thread changes
must use native navigation so drafts remain host-owned.

## Verification
Pure tests for ordering/boundaries and gesture classification, SDK typecheck,
plugin build, root checks subject to full-suite approval rules, local install
and reload, installed-source/status inspection, exact release-tag commit
inspection, and Steel mobile/desktop screenshot and interaction checks.

## Capability Deltas

See deltas/mobile-thread-navigation.md.
