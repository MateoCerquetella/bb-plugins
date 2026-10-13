# Decisions: Fix Https Github Com Mateocerquetella Bb Plugins Issues 64 Review

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The RPC requires JSON values; current unknown activity writes an own undefined
property. The frontend already accepts absence. PR 66's existing search
predicate drops matching empty groups.

### Options

Omit unknown activity using object rest, or sanitize the entire response through
JSON serialization. Retain empty project-name matches in search, or introduce a
separate empty-project rendering path.

### Chosen approach

Remove only the unknown activity property and correct the existing search
predicate. Keep independent commits and leave unfinished PRs open.

### Trade-offs and risks

Object spreading alone can retain stale activity. Round-trip identity and stale
boolean tests guard this. PR readiness can change; inspect exact heads before
merging.

### Verification

Focused Usage Tracker and Dockside tests, typechecks, builds, root checks, and
exact-head GitHub merge receipts.
# Maintenance Decisions

- Keep the bounded request together with separate commits for independently
  reviewable production changes and shared root verification.
- Represent unknown activity by absence, not null or undefined, preserving the
  existing frontend contract and RPC JSON validation.
- Repair #66's search predicate before merging its empty-project change.
- Leave #57 and #69 open because their recorded draft/CI/conflict/incomplete
  work is outside this small maintenance correction.
- Prepare a patch version; no unrequested package registry publication.
