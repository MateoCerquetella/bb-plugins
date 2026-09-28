# UI/UX Consult

Specialist: ui-ux

Verdict: advisory

## Findings

### UX-1

- Severity: high
- Category: acceptance
- Location: `mockups/index.html`
- Finding: The visual artifact still presents a dedicated internal Worker page,
  while the approved interaction creates a native BB thread with Taskboard in
  the standard right panel.
- Recommendation: Treat the Worker-page half of the mockup as historical only
  and verify the native thread plus right-panel composition in the live BB UI.

### UX-2

- Severity: high
- Category: state
- Location: `spec.md`, acceptance criteria
- Finding: The original criteria ended at thread creation and did not define
  what the issue panel shows after the thread starts or reaches a terminal
  outcome. That omission permits completed work to appear untouched.
- Recommendation: Require a durable linked-thread state in the issue panel,
  with explicit running, completed, failed, and canceled presentations.

### UX-3

- Severity: medium
- Category: navigation
- Location: issue-specific right panel
- Finding: A linked state without a return path can strand users in the board
  after work has moved to a native thread.
- Recommendation: Provide a direct action that navigates to the linked thread.

### UX-4

- Severity: medium
- Category: trust
- Location: issue status presentation
- Finding: Internal agent completion and provider-native issue status are
  different facts. Presenting them as one state would imply that Taskboard
  changed Linear, GitHub, or Jira when it may not have authority to do so.
- Recommendation: Label the linked worker outcome independently and change the
  external status only under an explicit configured completion policy.

## Conclusion

The approved native-thread and right-panel direction is clear, but the
lifecycle state is part of the core interface, not background bookkeeping.
The amended criteria close the missing contract: users can see that work
started, see how it ended, and return to the worker without Taskboard claiming
an unauthorized provider transition.
