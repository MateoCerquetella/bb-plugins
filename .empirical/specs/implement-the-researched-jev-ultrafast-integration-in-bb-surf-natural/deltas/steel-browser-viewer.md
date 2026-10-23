# BB Surf Engine Execution

## ADDED Requirements

### Requirement: Selectable verified-boundary Jev execution

BB Surf SHALL offer project-isolated Playwright, Jev and Auto policies.
Authorized Jev goals SHALL execute against the existing project Steel page.
URL-only tasks and explicit deterministic operations SHALL retain Playwright.
Terminal model status SHALL be validated and accompanied by a requirement for
independent outcome verification and clearly bounded timing.

#### Scenario: Jev completes
- GIVEN a configured authorized Jev runtime
- WHEN it finishes on the existing project page
- THEN BB Surf returns validated terminal status, action count and timing
- AND it does not claim independent verification or destroy the project page.

### Requirement: Fail closed at the execution boundary

BB Surf SHALL require explicit per-run paid authorization, private credentials,
and a valid runtime before dispatch. Fallback SHALL be opted-in and limited to
preflight. Cancellation and uncertain execution SHALL never replay actions.
The CDP bridge SHALL accept only authenticated bounded supported operations.

#### Scenario: Jev setup fails
- GIVEN fallback is enabled
- WHEN Jev fails preflight before dispatch
- THEN Playwright handoff includes a safe actionable setup reason.

#### Scenario: Runtime returns invalid output
- WHEN execution has started and output is malformed or non-terminal
- THEN BB Surf reports uncertainty and does not replay or claim success.
