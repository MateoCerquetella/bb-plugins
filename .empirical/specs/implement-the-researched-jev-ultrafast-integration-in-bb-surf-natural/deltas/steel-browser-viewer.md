# BB Surf Engine Execution

## MODIFIED Requirements

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
The Jev action-model and text-model API keys SHALL be configurable through
native BB secret settings and excluded from frontend setting values. Saved
keys SHALL override corresponding values from an optional private dotenv file;
blank saved keys SHALL fall back to that file.

#### Scenario: Jev setup fails
- GIVEN fallback is enabled
- WHEN Jev fails preflight before dispatch
- THEN Playwright handoff includes a safe actionable setup reason.

#### Scenario: Runtime returns invalid output
- WHEN execution has started and output is malformed or non-terminal
- THEN BB Surf reports uncertainty and does not replay or claim success.

#### Scenario: Saved credentials are complete
- GIVEN both API keys are saved through BB Surf settings
- WHEN Jev preflight runs with no dotenv path
- THEN the saved keys are used without exposing them to the frontend
- AND paid execution still requires explicit per-run authorization.

#### Scenario: Saved credentials are incomplete
- GIVEN one saved API key is blank and the optional dotenv file does not supply it
- WHEN Jev preflight runs
- THEN execution fails before dispatch with a safe missing-credentials error.
