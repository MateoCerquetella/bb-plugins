# Design

## Approach

The release branch already contains current `origin/main` (merged during the
target sync). The filter branch is a clean fast-forwardable set of six commits
on top of the same history: `git merge-tree` predicts no conflicts.

1. Merge `origin/filter-by-bbplugins-thr_q7uptvnbap` with a `--no-ff` merge
   commit so the release history records the integration explicitly.
2. Bump `plugins/dockside/package.json` to `0.1.8` and update the README's
   "range currently resolves" link from `dockside/v0.1.5` to `dockside/v0.1.8`.
3. Let the branch's own README/filter documentation changes come in through the
   merge unchanged.
4. Run the Dockside workspace build, typecheck, and test suite. Confirm the
   built bundle contains the new grouping and `Failed` labels.
5. Open a PR to `main`, merge it, then create and push the annotated tag
   `dockside/v0.1.8` on the resulting `main` commit.
6. Verify the marketplace Git source resolves `0.1.8` for the `^0.1.0` range.

## Why tag after the merge

`dockside/v0.1.7` was tagged on a feature branch and its code never reached
`main`. Tagging the merged `main` commit makes the release source match the
reviewed default branch and prevents another divergent release.

## Blast radius

Only `plugins/dockside` changes. The marketplace entry keeps its
`^0.1.0` range, so no marketplace JSON edit or `v1-change` label is needed.
Earlier tags are not moved.

## Risks

- The merged branch could regress mobile-navigation behavior added in 0.1.7.
  Mitigation: the branch is based on post-0.1.7 main and the Dockside suite
  covers thread management, filtering, and card layout.
- Tagging before `main` is updated would repeat the 0.1.7 drift. Mitigation:
  tag only after the PR merge is confirmed.
- A failed CI run on the PR blocks the release. Mitigation: treat a red check
  as a stop condition, not something to bypass.
