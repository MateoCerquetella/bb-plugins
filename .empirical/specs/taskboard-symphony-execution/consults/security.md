# Security advisory

- Specialist: security
- Verdict: advisory

## Evidence

Reviewed execution normalization, approval digests, SQLite uniqueness/transactions, authenticated HTTP registration, generation-bound events, workspace preparation, independent verification, and the pinned Symphony tracker extension. Focused tests exercise cancellation, late events, duplicate requests, unavailable snapshots, untrusted issue context, and repository/branch/revision checks.

## Findings

- Severity: low
  Category: deployment-boundary
  Location: plugins/taskboard/execution/README.md
  Recommendation: Run one Symphony daemon per runtime identity, retain loopback or authenticated private transport, and keep runtime credentials out of source and agent context. The initial verifier intentionally requires shared workspace access.

## Controls

The coding agent receives no Taskboard HTTP token or provider-native tracker tools. Native handoff is bound to its issue and generation and only reports implementation completion. Taskboard independently verifies the committed tree and requires human acceptance review before its provider adapter can complete a managed task. Git metadata and workspace real paths must remain inside the configured workspace. Approved checks execute as bounded argv with a minimal environment. A 404 requires a healthy global Symphony snapshot before workspace release is inferred.

## Limits

This is a full-trust BB plugin and Symphony runtime, not a new security sandbox. Approved repository code and commands execute with the runtime user's filesystem permissions. The pinned upstream dependencies emitted security advisories during dependency installation; the observation server must remain private, and upstream dependency updates require compatibility review. No credentials, paid coding sessions, external issue mutations, merge, or deployment were used during verification.
