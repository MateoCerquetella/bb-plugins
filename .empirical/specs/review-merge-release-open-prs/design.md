# Design

## Review boundary

Use isolated worktrees rooted in a disposable clone. Fetch the exact PR heads,
inspect `origin/main...head`, ancestry, commit provenance, and marketplace/release
state. Run the affected plugin checks from those exact heads.

PR #42 carries nine owner-authored Dockside commits in addition to the
contributor's touch fix. Preserve those reviewed product changes, but restore
the repository's `isolation.mode: ask` contract and correct stale marketplace
documentation before merging. PR #45 is a clean Aura-only change.

## Merge sequence

1. Correct PR #42 on its maintainer-editable head and rerun Dockside checks.
2. Merge PR #42 with history preserved.
3. Refresh PR #45 against the new `main`, rerun Aura plus repository-sensitive
   checks, and merge it.
4. Verify both merge commits are reachable from remote `main`.

## Release sequence

Create one release commit on a dedicated branch from the post-merge `main`:

- Dockside `0.1.4` -> `0.1.5`
- Aura `0.2.1` -> `0.2.2`
- update lockfile records and release-facing changelogs/readmes as required

Run focused plugin checks and repository CI, review the release diff, merge the
release branch, then create annotated `dockside/v0.1.5` and `aura/v0.2.2` tags
at the reviewed release commit and publish matching GitHub releases.

## Marketplace verification

No marketplace repository edit is required because the live entries already
use compatible ranges (`^0.1.0`, `^0.2.1`) and plugin tag prefixes. After tag
publication, resolve each range against remote tags and verify the newest match
is the new patch.

## Failure handling

Never move an existing tag. Do not tag until the release commit is on `main`.
If any PR or release check fails for a change-related reason, stop publication,
repair on a branch, and rerun the exact affected matrix. Keep the dirty primary
checkout untouched throughout.
