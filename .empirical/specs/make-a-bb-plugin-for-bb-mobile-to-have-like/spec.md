# Thread Mobile

## Request

> Make a bb plugin for bb mobile to have like arrows or tinder stylrer to go strong it the threads more easily. You teasesrch and do it don’t ask me

## Goal

Ship an independent Thread Mobile plugin that makes mobile BB thread browsing
one-thumb friendly through previous/next controls and horizontal swipes.

## Acceptance Criteria

- [ ] [AC-1] Current-project visible, non-archived root threads have deterministic newest-created-first navigation; the current child is included when viewing one.
- [ ] [AC-UI-1] [UI] At widths up to 767px, a compact strip above the composer offers accessible 44px previous/next arrows, title and position. Desktop is unchanged.
- [ ] [AC-UI-3] [UI] The strip shows the current thread's live BB status using the host-provided accessible indicator label, with "Idle" when the host reports no indicator. Status changes update without navigation or message inspection.
- [ ] [AC-UI-2] [UI] A deliberate horizontal swipe on the strip changes one thread; vertical movement, cancellation, short gestures and gestures outside the strip never navigate.
- [ ] [AC-2] Boundaries disable navigation without wrapping. Loading, errors and singleton lists are safe; stale requests cannot change the current thread.
- [ ] [AC-3] The plugin is independently installable with source manifests, CLI list surface, tests, README and root catalog entry.

## Scope
New plugins/thread-glide package, root plugin catalog/lockfile, focused tests
and live mobile browser verification. Use host SDK navigation and sidebar
thread status APIs.

## Non-goals
No archive/delete/vote gesture, no native BB patch, no desktop UI replacement,
no message-content capture, no inferred completion state, no cross-project
automatic navigation.

## Risks
Mobile composer layouts and SDK mounting support must be verified. Gestures
must not steal vertical scrolling or native edge-back gestures. Thread changes
must use native navigation so drafts remain host-owned.

## Verification
Pure tests for ordering/boundaries and gesture classification, SDK typecheck,
plugin build, root checks subject to full-suite approval rules, local install
and reload, Steel mobile/desktop screenshot and interaction checks.

## Capability Deltas

See deltas/mobile-thread-navigation.md.
