# Decisions: Review, Merge, And Release Open PRs

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Review PR #42 as its full merge diff

Status: Accepted

### Evidence

- The branch contains ten commits beyond its merge base; nine are owner-authored
  Dockside UI/releases and one is the contributor touch fix.

### Options

1. Review only the final contributor commit.
2. Review and preserve the complete proposed merge delta.

### Chosen approach

Choose option 2 so every line entering `main` is reviewed and the already-tagged
owner changes become reachable from the default branch.

### Trade-offs and risks

The broad PR title understates scope; explicit ancestry, complete-diff review,
and focused verification make that scope visible.

### Verification

Record the commit graph, inspect `origin/main...head`, and run all Dockside
checks on the exact corrected head.

## D-002: Correct workflow and documentation drift before merge

Status: Accepted

### Evidence

- PR #42 changes `.empirical/config.json` from `ask` to `off`, while current
  `main` and repository policy require `ask`.
- Its README says marketplace PR #162 is pending although that PR is merged.

### Options

1. Merge the drift unchanged.
2. Restore the isolation policy and accurate marketplace text on the
   maintainer-editable PR head.

### Chosen approach

Choose option 2 before merge.

### Trade-offs and risks

This adds a maintainer correction to a contributor branch, but prevents a
workflow-policy regression and ships truthful documentation.

### Verification

Diff the corrected PR head against `main` and rerun Dockside checks.

## D-003: Publish Git-only patch releases

Status: Accepted

### Evidence

- Neither package exists in npm.
- Both live marketplace entries use Git sources, compatible semver ranges, and
  plugin-specific tag prefixes.

### Options

1. Attempt npm publication.
2. Edit marketplace metadata only to name a patch.
3. Publish annotated Git tags and GitHub releases resolved by existing entries.

### Chosen approach

Choose option 3: Dockside 0.1.5 and Aura 0.2.2.

### Trade-offs and risks

Marketplace freshness depends on correct tag naming and reachability, so tag
peeling and semver resolution are explicit release gates.

### Verification

Confirm tags peel to the reviewed `main` release commit and existing marketplace
ranges select the new patches.

## D-004: Isolate all work

Status: Accepted

### Evidence

- The primary checkout has extensive unrelated modifications and a stale
  Empirical selector.

### Options

1. Modify the dirty primary checkout.
2. Conduct all work in a disposable isolated clone.

### Chosen approach

Choose option 2, leaving the primary checkout byte-for-byte untouched.

### Trade-offs and risks

Dependency installation is repeated, but user work cannot be overwritten.

### Verification

Recheck the primary checkout status at handoff and perform all source/release
mutations only from the isolated clone.
