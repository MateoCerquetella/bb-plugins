# Steel Browser Infrastructure

## Purpose

Give BB agents and users a local, self-hosted browser session service with a
small operational surface that can replace the paid KERNEL.SH dependency.

## ADDED Requirements

### Requirement: Durable local service
The dyaus host SHALL run a pinned Steel image with persistent data, automatic
restart, and loopback-only API/UI and debugger ports.

#### Scenario: Service restarts
- WHEN the service restarts
- THEN health is restored on port 3100
- AND its API and debugger remain loopback-only

### Requirement: Browser session lifecycle
BB SHALL provide bounded typed operations and CLI commands for Steel health,
session listing, creation, and exact-session release.

#### Scenario: Session lifecycle
- WHEN a user creates a session
- THEN its identifier and connection data are returned and it appears in the list
- WHEN the user confirms release of that identifier
- THEN only that session is released

#### Scenario: Unavailable service
- WHEN Steel cannot be reached before the timeout
- THEN BB remains responsive and reports a concise error without secrets

### Requirement: Operational app
The Steel Browser page SHALL expose status, endpoint, active sessions, refresh,
create, and confirmed-release controls with loading, empty, and error states.

#### Scenario: Responsive page
- WHEN the page opens on desktop or mobile
- THEN status and session controls are usable without clipping or overlap

### Requirement: Agent and plugin distribution
The plugin SHALL be independently installable and ship a local Steel skill.

#### Scenario: Installation
- WHEN installed locally and reloaded
- THEN its app and CLI work and its agent skill explains local Steel usage
- AND generated build and dependency artifacts remain untracked

### Requirement: Optional jev-ultrafast agent adapter
The plugin SHALL provide an opt-in adapter that passes an existing Steel CDP
endpoint to jev-ultrafast without vendoring or proxying its implementation.

#### Scenario: Configured agent run
- WHEN the user supplies the jev-ultrafast repository/runtime and external
  model credential references
- THEN the adapter validates the references, targets the selected Steel
  session's CDP endpoint, and returns bounded run status
- AND the adapter states that TypeSafe and text-model requests leave the host

#### Scenario: Missing agent credentials
- WHEN required jev-ultrafast credentials are absent
- THEN the adapter fails before creating browser actions
- AND no credential values are included in logs, plugin state, or errors
