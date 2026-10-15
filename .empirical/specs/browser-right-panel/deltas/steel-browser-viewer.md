## ADDED Requirements

### Requirement: Human-controlled viewer handoff on the current client

Cerq Browser SHALL expose Open in your browser on its right-panel, plugin-page and inline handoff surfaces, including a minimized handoff. The action SHALL be available when the validated HTTPS project viewer URL is known even if the embedded viewer is not ready. Only deliberate user activation SHALL open a new client tab with noopener/noreferrer, using the same viewer/session URL. The agent SHALL retain its existing project browser; no cookies SHALL be imported from the user's OS browser. Instructions SHALL allow this human-controlled handoff while keeping agent automation inside the project session.

#### Scenario: Easier login on a Mac client

- **GIVEN** the user is viewing BB on their Mac and a project viewer is available
- **WHEN** they activate Open in your browser
- **THEN** their client opens the same viewer in a top-level tab
- **AND** BB Connect authentication can happen there using the client's sign-in flow
- **AND** the existing agent browser and in-BB viewer remain available

#### Scenario: A viewer still needs authentication

- **GIVEN** the embedded viewer has not signaled readiness
- **THEN** the handoff action remains visible and usable
- **AND** no tab is opened until the user activates it

## MODIFIED Requirements

### Requirement: Expand the live right panel without a modal

The browser SHALL offer the host right thread panel through its Monitor icon and an Open browser panel button in each handoff. A fine pointer dwelling for 2000ms SHALL expand the visible panel to about two-thirds of the viewport without a backdrop or focus trap, leaving at least 28% for the active thread. Pointer leave SHALL restore a hover expansion. Explicit Expand/Shrink and Escape SHALL be available, and the same iframe SHALL survive resizing. Mobile SHALL use explicit controls without automatic hover expansion. Timer cleanup SHALL prevent expansion after leave, blur, unmount or thread change.

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
