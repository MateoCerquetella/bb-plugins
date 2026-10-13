# Decisions: Extend The Existing Taskboard Plugin Into A Bb Native Software

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The user rejected a full-page factory and approved the revised native thread
with Taskboard open on the right. Main currently prefills compose and does not
persist a ticket-to-thread relationship. PR #57 provides native dispatch
patterns but conflates turn completion with tracker completion.

### Options

1. A separate full-page factory interface.
2. Compact progress in the existing Taskboard right panel, using native BB
   threads for work and conversation.

### Chosen approach

Option 2, as one bounded vertical slice within Taskboard. Implement additive
storage and explicit gates. Do not install over the live plugin.

### Trade-offs and risks

Persist dispatch intent before native calls. Ambiguous outcomes require human
reconciliation; they must not automatically dispatch again. Native turn status
is not task acceptance. Preserve tracker adapters and user data.

### Verification

Transition, persistence, duplicate dispatch and recovery tests; native BB
execution harness; browser rendering of thread-plus-panel progress; root checks.
