# Decisions

## D-001: Reuse pointer capture helpers

Status: Accepted

### Evidence

Action rows already use `tryCapturePointer` and `tryReleasePointer`; topbar
tabs currently do not.

### Options

1. Keep window-only listeners.
2. Add native HTML drag.
3. Use pointer capture with the current custom drag flow.

### Chosen approach

Use pointer capture with the current flow.

### Trade-offs and risks

This adds a pointer ID to drag state, but preserves current drop and reorder
behavior while making the gesture durable.

### Verification

Contract assertions plus tab drag/release/cancel exercise.

## D-002: Use a dedicated topmost plugin tier

Status: Accepted

### Evidence

The launcher currently uses `z-index: 120`, while current host sidebars and
drawers can sit above it.

### Options

1. Increment the existing values.
2. Target host selectors.
3. Use a near-maximum plugin tier.

### Chosen approach

Use a near-maximum tier with explicit topbar, launcher, overlay, and ghost
ordering.

### Trade-offs and risks

Plugin surfaces can cover host dialogs while open, matching the explicit
requirement to stay above all BB UI.

### Verification

Ordered CSS contract assertions and browser overlap captures.

## D-003: Suppress touch panning only on draggable controls

Status: Accepted

### Evidence

Action rows already declare `touch-action: none`; tab buttons do not.

### Options

1. Suppress touch gestures on the whole header.
2. Suppress them only on tab buttons.

### Chosen approach

Suppress touch gestures only on tab buttons.

### Trade-offs and risks

This preserves horizontal and native interactions elsewhere in the header.

### Verification

Stylesheet contract assertion and narrow viewport exercise.

## D-004: Preserve host-owned Action dragging

Status: Accepted

### Evidence

BB owns pane-zone drag and Action execution through
`experimental_beginThreadActionSplitDrag`.

### Options

1. Reimplement Action split dragging inside the plugin.
2. Preserve the host-owned integration.

### Chosen approach

Preserve the host-owned integration.

### Trade-offs and risks

Runtime support remains dependent on a compatible BB build.

### Verification

Source contract plus local Action-row drag.
