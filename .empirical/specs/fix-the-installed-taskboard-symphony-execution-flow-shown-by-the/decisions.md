# Execution defaults decisions

## D-001: Resolve detached checkouts from local Git metadata

Status: Accepted

### Evidence

The live Taskboard plugin reports `executionDefaults failed: Git validation
failed: symbolic-ref`. Its handler requires an attached HEAD before returning
the repository or revision, while BB project worktrees may validly be detached.

### Options

- Require users to attach the BB project checkout manually.
- Hardcode `main`.
- Resolve an attached or detached checkout from existing local Git metadata.

### Chosen approach

Use a bounded, deterministic fallback chain from attached branch through exact
local refs, remote default metadata, and configured Git default branch. Preserve
the exact HEAD SHA as the approved base revision.

### Trade-offs and risks

A repository with no branch metadata may use its configured initial branch,
which might not exist remotely. The field stays reviewable in the approval UI,
and workspace creation will still fail closed if the approved base cannot be
checked out.

### Verification

Cover attached, detached exact-ref, remote-default, and invalid repository
cases with temporary Git repositories. Confirm the live plugin no longer emits
the `symbolic-ref` failure.

## D-002: Translate validation at the UI boundary

Status: Accepted

### Evidence

The review form currently catches generic exceptions, so Zod issues can reach
users as implementation-shaped errors.

### Options

- Keep raw schema errors.
- Duplicate field validation in the form.
- Format authoritative schema issues at the form boundary.

### Chosen approach

Format the first Zod issue as `<Field>: <correction>` in the panel while
leaving the shared execution schema authoritative.

### Trade-offs and risks

Only the first issue is shown per attempt to keep the dialog concise.

### Verification

Add a focused unit test for field-error formatting and retain schema tests.
