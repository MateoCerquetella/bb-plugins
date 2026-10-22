# UI/UX consult: explicit factory AI selection

Specialist: ui-ux
Verdict: advisory
Scope read: spec.md, mockups/project-manage-factory.md, grouped-ticket-team.md

## Findings

- severity: medium
  category: discoverability
  location: mockups/project-manage-factory.md, Configured factory
  recommendation: Keep the AI choice inside the existing Project Manage factory
  block instead of a separate page. The operator already saves enablement and
  concurrency there; splitting execution into another surface would hide the
  setting that unblocks a failed Start task.

- severity: medium
  category: failure recovery
  location: spec.md AC-8 and AC-UI-1
  recommendation: Distinguish "No AI selected / using project defaults" from
  "No project defaults". The first is a valid state, the second is the failure
  the operator hit. Show the second beside the picker with the same actionable
  wording shown on a failed Start task.

- severity: low
  category: conditional controls
  location: mockups/project-manage-factory.md, narrow viewport
  recommendation: Hide reasoning when the model reports no supported efforts and
  hide service tier when the provider capabilities exclude it. Do not leave
  disabled empty selects that look broken.

- severity: low
  category: change semantics
  location: spec.md AC-8
  recommendation: State in the panel that a new AI choice applies to new
  sessions only. Operators otherwise expect an in-flight stage to switch models.

- severity: low
  category: responsive layout
  location: mockups/project-manage-factory.md, Narrow viewport
  recommendation: Stack label and control rows for the picker at narrow widths
  and let long model display names wrap; the existing labeled-row pattern is
  sufficient and no new modal is needed.

## Missing from the criteria before this pass

- The spec did not say what happens when the operator has no explicit choice and
  the project also has no native defaults. Added to AC-8.
- The spec did not say whether changing the picker rewrites running sessions.
  Added to AC-8 and the mockup copy.
- The project Manage criteria did not mention the AI controls at all. Added to
  AC-UI-1 and the mockup.

## Second pass: shared picker and new-task flow

Specialist: ui-ux
Verdict: advisory
Scope read: spec.md, mockups/project-manage-factory.md, mockups/new-task-ai.md

### Findings

- severity: medium
  category: recognition
  location: spec.md AC-8 and mockups/new-task-ai.md
  recommendation: Show provider logos in both the closed select and the summary.
  Operators recognize the logo faster than a provider name, and a missing image
  must degrade to the readable name rather than an empty tile.

- severity: medium
  category: consistency
  location: spec.md AC-UI-1
  recommendation: Reuse one picker component instead of two copies. Two surfaces
  that drift in provider support or reset semantics are worse than one surface
  with a slightly longer dialog.

- severity: medium
  category: precedence
  location: spec.md AC-8 and AC-9
  recommendation: State the resolution order in the dialog: task choice, then
  project policy, then native defaults. Without that, a project-level change
  silently surprising an already-created task is hard to diagnose.

- severity: low
  category: control clarity
  location: mockups/new-task-ai.md
  recommendation: Keep Concise/Detailed as a two-option select directly beside
  Improve, not a separate settings switch. The choice belongs to the action, not
  to the ticket.

- severity: low
  category: feedback
  location: mockups/new-task-ai.md
  recommendation: While the helper runs, show that it is using the task/thread AI
  in the status line. The operation is slow enough that the model choice should
  remain visible.

### Missing from the criteria before this pass

- The spec did not say the new-task dialog shares the picker. Added to AC-8 and
  AC-UI-1.
- The spec did not define task-over-policy precedence. Added to AC-8.
- The spec did not define Concise versus Detailed output. Added to AC-9.
- The improvement helper had no execution-resolution rule. Added to AC-9.
