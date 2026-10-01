# Design

## Overview

The repair stays inside Action Topbar's content script and stylesheet. Tab
gestures will use the existing pointer-capture helpers already used by Action
rows. The topbar's owned surfaces will share an explicit high stacking tier so
host sidebars and drawers cannot obscure them.

## Pointer Lifecycle

`beginTopbarDrag` captures the initiating primary pointer on the tab button and
stores its `pointerId`. Move, up, and cancel handlers ignore unrelated pointers.
`endTopbarDrag` always releases the stored pointer before clearing state,
whether the drag engages, drops, cancels, or is superseded. Tab buttons declare
`touch-action: none` to prevent browser panning from cancelling pointer events.

Action-row dragging remains delegated to
`experimental_beginThreadActionSplitDrag`; its existing capture and release
lifecycle is preserved.

## Stacking

Define one near-maximum base custom property and consecutive tiers:

- Topbar: base tier.
- Launcher: base + 1.
- Drop overlay: base + 2.
- Drag ghost: base + 3.

The topbar receives `position: relative` so its z-index participates. The
launcher, overlay, and ghost remain body-level fixed surfaces and preserve
their existing geometry and pointer-event behavior.

## Risks

- A maximum-like z-index can cover host dialogs. This is intentional for the
  user's request that Action Topbar stay above all BB UI, while consecutive
  values preserve ordering among plugin surfaces.
- Pointer capture can survive outside tab bounds; filtering by pointer ID and
  unconditional release prevent stale or cross-pointer drag state.
- Touch suppression removes native panning only from draggable tab buttons,
  not from the tab strip or surrounding header.

## Verification

Contract tests assert capture/release, pointer filtering, touch suppression,
and strictly increasing high overlay tiers. Focused tests and typechecking
cover source correctness; local browser verification covers real overlap,
desktop/narrow viewports, and host-owned Action split dragging.
