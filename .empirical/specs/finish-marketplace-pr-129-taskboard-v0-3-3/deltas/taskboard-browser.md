# Taskboard Browser Delta

## ADDED Requirements

### Requirement: Taskboard-specific thread-header entry point

The thread-header action that pins Taskboard on the right SHALL use the
Taskboard `Ticket` icon while retaining the existing accessible label, tooltip,
pinning state, and panel-opening behavior.

#### Scenario: Pin Taskboard from a thread

- **WHEN** a user views the Taskboard action in a thread header
- **THEN** the action displays the `Ticket` icon rather than a generic panel icon
- **AND** activating it still pins and opens Taskboard on the right
