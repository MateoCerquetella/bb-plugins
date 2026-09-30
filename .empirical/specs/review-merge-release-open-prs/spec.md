# Review Merge Release Open Prs

## Request

> Review all open pull requests in MateoCerquetella/bb-plugins, merge those that are correct and verified, then create and publish new patch releases for affected BB plugins so the BB Community marketplace ranges resolve them.

## Goal

Review every currently open pull request against its complete merge diff, merge
only changes that are correct and fully verified, and publish immutable patch
releases for every affected BB plugin so existing BB Community marketplace
semver ranges resolve the fixes.

## Acceptance Criteria

- [ ] [AC-1] Every open pull request is reviewed against its full diff and has
  no unresolved correctness, security, workflow, or distribution finding at
  merge time.
- [ ] [AC-2] Accepted pull requests pass their plugin-focused typecheck, tests,
  build, and whitespace checks from an isolated checkout.
- [ ] [AC-3] Accepted pull requests are merged into `main` without overwriting
  unrelated local work or weakening the repository's Empirical isolation
  policy.
- [ ] [AC-4] Each affected plugin receives exactly one new patch version whose
  immutable annotated Git tag peels to reviewed release content reachable from
  `main`.
- [ ] [AC-5] GitHub releases describe the shipped fixes, and the live BB
  Community marketplace entries' existing semver ranges and tag prefixes
  resolve the new versions without requiring unnecessary metadata churn.
- [ ] [AC-6] Post-merge and release-source verification confirms the affected
  plugins still typecheck, test, and build successfully.

## Scope

- PR #42 (Dockside touch action availability) including all inherited commits
  currently present in its merge diff.
- PR #45 (Aura composer readability, image caching, and rendering efficiency).
- Corrective PR-branch changes required to make those merge diffs safe.
- Patch releases for Dockside and Aura, plus marketplace resolution checks.

## Non-goals

- Publishing either plugin to npm; both are distributed from immutable Git
  tags.
- Reworking unrelated plugins or marketplace descriptions/icons.
- Modifying or discarding the user's dirty primary checkout.
- Moving or replacing any existing release tag.

## Verification

- Run each affected plugin's focused typecheck, full test suite, build, and
  `git diff --check` in isolated checkouts.
- Inspect PR ancestry and the complete base-to-head diff, not only the final
  contributor commit.
- Verify merged PR state and `main` ancestry through GitHub.
- Verify tag signatures/peeling, GitHub release metadata, package versions, and
  live marketplace entry ranges/tag prefixes.

## Capability Deltas

- `deltas/plugin-git-distribution.md`
