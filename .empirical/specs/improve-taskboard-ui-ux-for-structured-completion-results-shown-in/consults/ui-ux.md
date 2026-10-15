# UI/UX advisory

Specialist: ui-ux

Verdict: advisory

## Assessment

The proposed session selector is a good fit for a task with several native
threads: it keeps navigation compact while preserving access to historical
attempts. The design is sound if the selector is treated as navigation only.
Task state must continue to own recovery, retry, continue, and uncertainty
actions, so selecting an older session cannot accidentally operate on that
older record.

## Findings

### UI-UX-1

- Severity: high
- Category: interaction/state ownership
- Location: `mockups/result-and-error-states.md`, Session navigation
- Recommendation: Keep the selector's selected session separate from the
  current task run used to render recovery controls. Label the selector with
  stage, attempt, and status, default to the newest run, preserve an explicit
  selection while the task remains open, and fall back deterministically when
  that run disappears. The single `Open session` action should open only the
  selected session; `Continue in thread`, retry, needs-input, and uncertain
  dispatch controls must remain tied to the current task state.

### UI-UX-2

- Severity: high
- Category: stage handoff
- Location: `mockups/result-and-error-states.md`, Session navigation and
  `spec.md`, AC-7 through AC-9
- Recommendation: Make each fresh Investigate, Plan, Build, and Review handoff
  visible as a distinct stage record with a concise status and attempt label.
  The phase track should summarize observed progress without implying human
  acceptance. Show the bounded input passed to the next stage in the native
  thread's ordinary Markdown when useful, while keeping the card itself
  compact; this makes the no-inherited-conversation boundary understandable
  without turning the selector into a second workflow surface.

### UI-UX-3

- Severity: high
- Category: recovery safety
- Location: `spec.md`, Risks and bounds; AC-8 and AC-9
- Recommendation: Surface automatic continuation as an observed state, not as
  an invisible retry. After each bounded continuation, expose the attempt
  count and the reason manual continuation is now required. Needs-input,
  unknown results, uncertain dispatch, changed scope, and unavailable
  environments should show an explicit next step without presenting a retry
  affordance. Active native work should replace cached Paused or Turn finished
  labels so a user never sees a stale recovery action.

### UI-UX-4

- Severity: medium
- Category: accessibility/responsive
- Location: `mockups/result-and-error-states.md`, Narrow layout
- Recommendation: Use a native single-select control with an accessible name
  that includes the task context, and expose the selected stage, attempt, and
  status in its option text. Keep the Open session control keyboard reachable
  after the selector, move it below the full-width selector at 390px, and
  ensure wrapped labels and technical details remain inside the viewport. The
  compact result and error cards should retain status/alert semantics without
  relying on color or icon shape alone.

## Deliberately ruled out

- A button row with one Open session action per historical thread.
- Recovery actions that operate on whichever historical session is selected.
- Hidden retries for needs-input, unknown, or uncertain dispatch outcomes.
- Treating Review completion or an agent verdict as human acceptance.
