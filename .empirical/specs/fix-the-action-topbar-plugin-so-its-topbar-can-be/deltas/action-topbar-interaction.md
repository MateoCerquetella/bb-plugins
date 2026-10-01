# Action Topbar Interaction Delta

## Purpose

Keep Action Topbar pointer gestures reliable across tab boundaries and keep its
launcher and drag feedback visible above BB application chrome.

## ADDED Requirements

### Requirement: Durable topbar pointer dragging

Action Topbar SHALL retain the initiating pointer while a tab drag is pending
or active, suppress native touch panning on draggable tabs, and release the
pointer when the gesture ends or is cancelled.

#### Scenario: Reorder an open tab

- GIVEN two or more tabs are visible in Action Topbar
- WHEN the user presses one tab, moves beyond the drag threshold, and releases
  over another tab
- THEN the drag remains active outside the source tab bounds
- AND the existing persisted reorder flow receives the drop
- AND pointer capture and temporary drag visuals are removed

#### Scenario: Cancel a tab drag

- GIVEN a topbar tab drag is pending or active
- WHEN the browser cancels the pointer gesture
- THEN pointer capture is released
- AND temporary drag state is removed without reordering or opening a pane

### Requirement: Topmost Action Topbar surfaces

Action Topbar SHALL place its owned topbar, launcher, drag ghost, and drop
overlay above BB's right sidebar and ordinary application chrome.

#### Scenario: Open launcher with right sidebar visible

- GIVEN BB's right sidebar is open
- WHEN the user opens the Action Topbar launcher
- THEN every overlapping part of the launcher remains visible and interactive
  above the sidebar

#### Scenario: Drag above application chrome

- GIVEN a topbar tab drag is active
- WHEN its ghost or drop overlay overlaps the right sidebar or other
  application chrome
- THEN the drag feedback remains visible above those surfaces
- AND the ghost remains above the drop overlay
