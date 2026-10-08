# UI/UX Direction

Specialist: ui-ux
Verdict: advisory

## Findings

- Severity: medium
  Category: usability
  Location: spec.md AC-3 and AC-UI-1
  Recommendation: Preserve the originating ticket selection after navigation
  and reload. Keep conversation and stop controls native. Incorporated into
  the approved contract.
- Severity: medium
  Category: usability
  Location: mockups/index.html completion state
  Recommendation: A completed turn must say Turn finished unless evidence
  actually establishes readiness for review. Do not imply verified completion.

## User correction

The initial full-page factory workspace was rejected. The desired experience is
the existing BB-native interaction:

1. The user opens an existing Taskboard item.
2. The user selects Send to agent.
3. Taskboard creates or reuses one native BB thread and navigates to it.
4. Taskboard remains open in the native right panel, focused on the originating
   ticket.
5. The right panel shows live work status and progress without replacing the
   thread, composer, permissions, or native stop controls.

## Recommended surface

- Keep the native thread as the primary workspace and conversation.
- Keep steering in the standard BB composer.
- Keep cancellation in the native thread stop control.
- Add a compact Agent progress section to the Taskboard right panel.
- Show investigation, plan, build, verification, and review as status rows, not
  as a separate board the user must navigate.
- Show current activity derived from native thread events and explicit
  Taskboard progress reports.
- Show linked workspace, changed files, checks, PR, and actionable failures.
- When a turn finishes successfully, show Turn finished and an explicit note
  that the task is not Done and the tracker remains unchanged.
- Start any independent review as a linked native BB session while keeping the
  same ticket panel available.

## Interaction constraints

- Send to agent is idempotent for the same dispatch and must not create a
  duplicate thread on double-click or restart.
- Opening the generated thread automatically opens or pins Taskboard's thread
  panel on the originating item.
- A user can always open the originating tracker item from the panel.
- Failed native operations name the failed action and retain the session and
  worktree when possible.
- Narrow layouts stack the Taskboard panel below the thread in the reference
  mockup; product behavior should follow BB's native right-panel responsive
  treatment rather than inventing a second mobile navigation system.

## Rejected direction

Do not add a full-page factory dashboard as the primary workflow for this
vertical slice. Do not require the user to leave the working thread to inspect
progress. Do not make Taskboard a competing chat or agent runtime.
