# Steel Browser Viewer Port Share

## Request

> Fix Steel Browser embedded viewer displaying 'this port is not shared'. Diagnose and repair port-share recovery without changing project isolation, verify regression tests and runtime behavior. User requests finish autonomously and merge the fix PR after verification.

## Goal

Restore missing BB Connect viewer shares even when the project's local Steel
API and CDP remain healthy, preserving the dedicated browser and its profile.

## Acceptance Criteria

- [ ] [AC-1] A healthy saved binding with a missing viewer share restores only its API port on the Steel host.
- [ ] [AC-2] Existing matching shares are reused; unrelated shares, CDP ports, sessions and profiles are unchanged.
- [ ] [AC-3] Container mismatch, viewer origin mismatch or Connect failure fails closed without caching success or recreating the browser.
- [ ] [AC-4] The existing ten-second readiness cache and concurrent request coalescing remain effective, with recovery after expiry.

## Scope

Steel backend readiness, narrowly scoped share recovery, tests and documentation.

## Non-goals

No UI redesign, authentication bypass, public CDP exposure, profile replacement,
new dependencies or unrelated PR merges.

## Risks

The request may originate on another host: Connect commands must explicitly name
the Steel host. Viewer authorization remains BB Connect's responsibility.

## Verification

Focused Steel tests, typecheck and build; actual CLI share recovery with retained
binding; inspect the embedded viewer in the current Steel session. Full repository
checks run through PR CI. An authentication gate is reported, not bypassed.

## Capability Deltas

See `deltas/steel-browser-viewer.md`.
