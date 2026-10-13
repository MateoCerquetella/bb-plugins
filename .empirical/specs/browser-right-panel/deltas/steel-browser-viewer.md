## ADDED Requirements

### Requirement: Expand the live right panel without a modal

The browser SHALL offer the host right thread panel through its Monitor icon and an Open browser panel button in each handoff. A fine pointer dwelling for 2000ms SHALL expand the visible panel toward the viewport width without a backdrop or focus trap. Pointer leave SHALL restore a hover expansion. Explicit Expand/Shrink and Escape SHALL be available, and the same iframe SHALL survive resizing. Mobile SHALL use explicit controls without automatic hover expansion. Timer cleanup SHALL prevent expansion after leave, blur, unmount or thread change.

#### Scenario: Watch an agent and return to chat

- **WHEN** the user opens the browser panel and hovers for two seconds
- **THEN** the existing project viewer expands with BB theme styling
- **AND** leaving restores the compact view without restarting the viewer or browser

#### Scenario: Short hover or keyboard use

- **WHEN** the pointer leaves before two seconds
- **THEN** no expansion occurs later
- **WHEN** the user activates Expand, Shrink or Escape
- **THEN** the panel changes size predictably without trapping focus

### Requirement: Personalized browser presentation

User-facing plugin navigation and viewer headings SHALL use Cerq Browser unless the user supplies another name, while steel-browser installation IDs, CLI commands and message directives SHALL remain compatible.

#### Scenario: Existing browser task

- **WHEN** an agent uses bb steel-browser project and emits ::steel-browser{}
- **THEN** the existing bound browser remains visible through the personalized UI
