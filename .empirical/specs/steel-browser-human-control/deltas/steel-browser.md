# Steel Browser

## Purpose
Provide a project-isolated browser workspace for human login and agent work.

## ADDED Requirements

### Requirement: Human Clipboard
Clipboard transfers require explicit user intent and a matching viewer window
and origin. Payloads remain transient in the frontend and viewer transport.

#### Scenario: Paste a password
The user focuses a remote field and uses Paste. Native paste remains available
when clipboard permissions are denied. No plugin RPC receives the text.

### Requirement: Project Sign-in Records
Service/account labels are scoped to one project and identify themselves as
user-confirmed with a confirmation timestamp, not proof of current auth.

#### Scenario: Two projects
A label confirmed in project A is absent in B. Removing its record does not
claim to log out or delete cookies.

### Requirement: Viewer Lifecycle
Only the latest inline viewer runs; hidden/minimized viewers release their
stream. Expanded control reuses one viewer.

#### Scenario: Multiple directives
Two directives in one thread mount only one iframe. Minimizing removes its
iframe; restoring reconnects without replacing the browser profile.

### Requirement: Browser Workspace
The plugin page provides responsive viewer, service sign-ins and session
management with source-validated viewer URLs.

#### Scenario: Start GitHub sign-in
The user selects GitHub for the selected project, navigates inside its Steel
browser, completes login themselves and explicitly saves an account label.
