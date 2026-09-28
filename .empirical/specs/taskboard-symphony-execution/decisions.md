# Execution integration decisions

## D-001: Keep Taskboard authoritative over a pinned Symphony tracker extension

Status: Accepted

### Evidence

Taskboard currently has WorkItem DTOs, a SQLite store, provider adapters, typed RPC, background sync, and composer handoff, but no planner or verifier. BB SDK 0.4.6 exposes authenticated plugin HTTP routes, settings, storage, and services. Symphony commit be10a1b has a Tracker behaviour with a fixed module registry and observational HTTP endpoints; it has no run-submission API.

### Options

- Invent a submission API or impersonate Linear: rejected because neither provides an honest integration boundary.
- Rebuild workspace scheduling and retry supervision in Taskboard: rejected because Symphony should own infrastructure.
- Add a small pinned Taskboard tracker extension to Symphony and a managed-execution boundary to Taskboard: selected.

### Chosen approach

Preserve the default local composer handoff. Explicit managed requests bind route, reviewed scope, acceptance criteria, repository/ref, and required checks to an immutable digest and durable execution ID. Symphony reads only approved requests through BB authenticated HTTP, owns runtime infrastructure, and returns structured implementation status. Taskboard independently verifies a frozen workspace revision before its existing provider adapter may advance tracker state. Verification includes required argv checks and a human acceptance review. No BB core changes or external tracker credentials in Symphony. The user approved the task-detail UI preview with go; advanced runtime fields stay behind disclosures.

### Trade-offs and risks

The registry extension needs a reproducible version-pinned patch and real-runtime compatibility tests. Initial verification requires Symphony workspaces on the BB server host or mounted at the same absolute path. Do not trust agent-reported success. Validate paths, repository, branch, and clean committed state before and after checks. Cache evidence only when approved check definitions and declared inputs match. Runtime retries keep identity; fix iterations use linked IDs and retain scope. Cancellation is acknowledged separately from intent. Preserve the user's uncommitted configuration edits. Keep this integration coherent with reviewable implementation units; do not publish.

### Verification

Test local compatibility, normalization, approval binding, duplicate dispatch, restart recovery, runtime state mapping, cancellation/failure/retry cases, revision-bound verification, evidence invalidation, and tracker ownership. Test the pinned Symphony extension with deterministic agent fixtures. Run Taskboard and workspace checks and verify the existing UI with isolated fixtures. Report unavailable runtime/browser evidence honestly.
