# UI/UX Specialist Consult

- specialist: `ui-ux`
- verdict: `advisory`

## Review Scope

Reviewed `spec.md` and every file under `mockups/`, with the previous consult
as context. This is a specification and mockup review. No implementation,
browser interaction, or screenshot verification was performed.

## Assessment

The updated artifacts sufficiently specify the required operator experience
for AC-UI-1 and the visible fail-closed behavior in AC-5. No blocking design
findings remain.

`mockups/project-manage-factory.md` now covers saved enablement, provider
identity, the todo intake policy, bounded concurrency, queue and active counts,
last scan results, and workflow blockers. Saving the enable switch implements
pause and resume without introducing a second setting. Unsaved and failed-save
states remain distinct from the persisted running state. Healthy idle, paused,
never-enabled, missing-configuration, provider-error, and provider-change states
have explicit text. Unknown and cached queue counts do not imply current
eligibility, and successful discovery does not hide blocked workflows.

`mockups/grouped-ticket-team.md` preserves one coordinator followed by stage
children, with role, native state, and a direct thread action. Waiting roles do
not expose nonexistent threads. Provider failure, stale eligibility, scope
change, closure change, pause, and uncertain coordinator creation have readable
reasons above the group and in its collapsed summary. Recovery links an
existing coordinator rather than creating a replacement. Legacy sessions are
identified without claiming a hierarchy they do not have.

Both mockups specify wrapping and stacked narrow layouts for long content,
textual state labels, visible focus, and accessible controls. The ticket
disclosure explicitly supports Enter/Space and `aria-expanded`; expansion is
keyed by ticket identity and retained across refresh.

## Prior Findings

- UI-UX-1 resolved by the new Project Manage factory surface and its distinct
  saved, paused, configuration, and failure states.
- UI-UX-2 resolved by explicit provider-read, stale-eligibility, scope-change,
  and closure-change presentations above each affected ticket group.
- UI-UX-3 resolved by wrapping rules for titles, identifiers, provider names,
  and reasons, plus stacked narrow layouts that preserve readable actions.
- UI-UX-4 resolved by the keyboard disclosure contract, visible action focus,
  and expansion retention across data refresh.

## Remaining Findings

None at specification and mockup scope.

## Implementation Verification

The spec still requires desktop and mobile browser evidence for the described
Manage and blocked-ticket states. Verify long content without horizontal
overflow, visible keyboard focus, disclosure and thread actions, failed-save
behavior, and expansion retention during refresh against the implemented UI.
This consult does not establish that those runtime acceptance checks passed.
