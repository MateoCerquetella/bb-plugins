# Decisions

## Native composer submission — accepted
Evidence: side-panel props expose project and params; composer view exposes draft, not all unsent selections. Choice: attach a preparation mention and let native Send create the thread, then bind using tool invocation context. Alternative: second NewThreadComposer instance; rejected because it could replace unsent selections with defaults. Risk: bootstrap and navigation need live verification. Verify chosen model/environment persisted from actual thread.

## Host-routed bounded context and isolated job cwd — accepted
Evidence: SDK host entry persistent dataDir, explicit environment hostId and threads.spawn host/unmanaged workspace. Choice: curated repository excerpts and agent jobs under plugin-owned host storage. Alternative: coding agent jobs directly in target cwd; rejected to avoid production edits. Tradeoff: context is bounded and some relevant details may remain questions. Verify symlink/secret exclusion and unchanged target files.

## Durable job and version history — accepted
Choice: plugin SQLite records, job state before spawn and append-only artifacts/revisions; CAS for edits. On uncertain spawn, surface a retryable error instead of duplicate execution. Stale brief output is a proposal. Verify reload reconciliation, individual failures, version selection and user-edit preservation.

## User disabled mockup approval — accepted
The user explicitly requested the working UI inside BB and disabled mockups. mockupsBeforeCoding is false and the external mockup terminal/tunnel were stopped. No mockup approval is claimed or requested; real UI and browser verification remain required.

## Existing tracker configuration — accepted
Read Taskboard's configured source, safe scope and cached tasks; bind only explicitly selected references. No duplicate credentials and no tracker writes. Verify missing connection still supports preparation.

## D-001: Native submission and isolated preparation jobs

Status: Accepted

### Evidence
Public composer side-panel interfaces do not expose all unsent root selections. Native mention context and agent tools carry preparation identity across normal submission. Host entry dataDir and explicit host routing provide isolated persistent artifact storage.

### Options
1. Reuse native Send and bind an explicit preparation reference to the resulting thread.
2. Add a second composer with remembered defaults.
3. Intercept host DOM and read private state.

### Chosen approach
Option 1 with a narrow bootstrap tool, bounded host-side repository context and separately spawned preparation jobs inheriting actual thread execution options. Persist jobs, revisions, artifacts and selection in Taskboard storage.

### Trade-offs and risks
Bootstrap completion depends on the selected agent using its supplied tool; this is observable and retryable. Agent prompts alone are not an OS sandbox. Job cwd remains outside target source. Preview code is opaque-origin sandboxed and cannot access parent state. Unknown repository facts stay questions.

### Verification
Inspect SDK declarations; exercise native Send, bound configuration, source retrieval, two agent-generated prototypes, refinement, selection, restart/export and target digest. Test context filters, CAS, parser limits, version preservation, remote host routing and preview restrictions.
