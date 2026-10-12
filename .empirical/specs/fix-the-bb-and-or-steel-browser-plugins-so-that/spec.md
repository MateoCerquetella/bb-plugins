# Fix The Bb And Or Steel Browser Plugins So That

## Request

> Fix the BB and/or Steel Browser plugins so that when an agent tells the user to sign in using the embedded Steel browser and emits the Steel browser surface directive, the browser is actually shown in the thread UI, as expected in the supplied screenshot context. Trace the directive/rendering integration, implement the appropriate fix, add focused regression coverage, and verify the relevant plugin checks and UI behavior.

## Goal

Whenever an agent asks the user to interact with the project Steel browser,
the same assistant message renders the native inline Steel viewer so the user
has an actual place to complete the requested sign-in, MFA, or manual action.

## Acceptance Criteria

- [ ] [AC-1] The Steel agent instructions require `::steel-browser{}` on its
  own line in the same assistant message whenever the agent asks the user for
  browser interaction, credentials, sign-in, MFA, or another manual handoff.
- [ ] [AC-2] The bundled Steel skill carries the same requirement and forbids
  referring to an embedded browser "above" unless that response contains the
  native directive.
- [ ] [AC-3] Focused regression tests fail if either contributed instructions
  or the bundled skill loses the same-message human-handoff requirement.
- [ ] [AC-UI-1] [UI] A rendered `::steel-browser{}` directive continues to
  mount the existing Steel inline browser without changing its viewer,
  authentication, session, or responsive behavior.

## Scope

Steel Browser's contributed agent instructions, bundled skill, focused
distribution tests, and documentation wording where needed.

## Non-goals

Changing BB's generic directive parser, opening an external browser, exposing
CDP or Connect URLs, automating credentials or MFA, changing Steel provisioning,
or redesigning the existing inline viewer.

## Verification

Run the Steel Browser focused tests, type checking, plugin build/check, and the
existing inline browser check when its project Steel dependency is available.
Confirm the instruction regression assertions cover sign-in and MFA handoffs.

## Risks

Agent instruction adherence is probabilistic, so the requirement must be short,
unambiguous, repeated in both injected instructions and the skill, and protected
by exact regression assertions. The change must not suggest that a directive
alone proves the viewer or BB Connect authentication is healthy.

## Capability Deltas

See `deltas/steel-browser-viewer.md`.
