# Design

## Existing behavior

Action Topbar maps the Taskboard action to its existing `task` icon kind. That
kind currently draws a clipboard/checkmark, while Taskboard registers `Target`
for its sidebar and panel actions and ships the same target/dart branding icon.

## Change

Replace only the SVG path data for Action Topbar's existing `task` icon kind
with target/dart geometry matching `plugins/taskboard/assets/icon.svg`.
`actionKind`, launcher rendering, fallback-tab rendering, sizing, color, and
all interaction code remain unchanged.

## Risks

The target must remain readable within the existing 24px view box and inherit
`currentColor`. Reusing the existing icon factory preserves those constraints.

## Verification

Run Action Topbar's focused tests, then inspect the launcher and Taskboard tab
in the installed plugin through BB Surf.
