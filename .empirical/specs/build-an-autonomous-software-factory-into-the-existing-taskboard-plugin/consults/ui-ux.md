# UI/UX Specialist Consult

- specialist: `ui-ux`
- verdict: `advisory`

## Review Scope

Reviewed `spec.md`, every file under `mockups/`, and three independent
operator-console prototypes against the production factory-state and action
inventory. Candidate C's ticket-first console was verified in its prototype at
1280, 800, and 390 px. This consult does not verify the production
implementation.

## Assessment

The revised contract now specifies the operator experience missing from the
earlier grouped-team mockup. Candidate C is the selected base. Its current-state
band and primary action lead the page, one stage rail replaces the team tree
plus lifecycle rail, attempts are scoped to their stage, and one evidence pane
owns run detail. Ticket context stays visible in a desktop rail and becomes a
Factory/Ticket switch at narrow widths.

`mockups/project-manage-factory.md` now covers saved enablement, provider
identity, the todo intake policy, bounded concurrency, queue and active counts,
last scan results, and workflow blockers. Saving the enable switch implements
pause and resume without introducing a second setting. Unsaved and failed-save
states remain distinct from the persisted running state. Healthy idle, paused,
never-enabled, missing-configuration, provider-error, and provider-change states
have explicit text. Unknown and cached queue counts do not imply current
eligibility, and successful discovery does not hide blocked workflows.

The current production layout repeats the same state through a team disclosure,
phase rail, global session selector, run detail, and separate Empirical block.
That duplication makes the operator reconcile several partial views and pushes
ticket intent below factory history. The selected console removes those
parallel representations. Coordinator recovery and Empirical observations move
to Workspace and are promoted into the summary only when they prevent work.

Prototype checks at 1280, 800, and 390 px established no horizontal overflow,
the primary action above the fold, and working narrow-view switching, stage
selection, and historical-attempt selection. These are prototype observations,
not production acceptance evidence.

## Prior Findings

- UI-UX-1 resolved by the new Project Manage factory surface and its distinct
  saved, paused, configuration, and failure states.
- UI-UX-2 resolved by explicit provider-read, stale-eligibility, scope-change,
  and closure-change presentations above each affected ticket group.
- UI-UX-3 resolved by wrapping rules for titles, identifiers, provider names,
  and reasons, plus stacked narrow layouts that preserve readable actions.
- UI-UX-4 resolved by the keyboard disclosure contract, visible action focus,
  and expansion retention across data refresh.
- UI-UX-5 resolved by replacing duplicate workflow presentations with one stage
  rail, one selected-run pane, and a distinct current-state summary.
- UI-UX-6 resolved by keeping ticket intent alongside factory evidence on wide
  screens and one keyboard-accessible view switch away on narrow screens.

## Remaining Findings

None at specification and mockup scope.

## Implementation Verification

The production implementation must still prove all preserved action states,
desktop and mobile composition, exact plan-approval guards, long-content
wrapping, visible keyboard focus, selection retention during refresh, and
thread navigation. It must also demonstrate that ticket detail has only one
workflow representation and that thread-dialog progress remains compact. This
consult does not establish those runtime acceptance checks.
