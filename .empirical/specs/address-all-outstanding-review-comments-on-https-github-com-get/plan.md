# Plan

1. Add a regression assertion to Dockside's distribution contract test for the
   complete runtime dependency set and package release version.
2. Update Dockside to v0.1.1, move Radix Context Menu, Radix Select, `clsx`, and
   `tailwind-merge` to `dependencies`, and regenerate the root lockfile.
3. Run focused Dockside tests and the isolated production-install check; repair
   only failures caused by this change.
4. Run typecheck, BB plugin build, the repository-wide check, and Empirical's
   configured publication verification matrix.
5. Obtain fresh-context review, integrate any findings, refresh repository
   context if required, and commit the verified source release locally.
6. Prepare a clean clone of the existing marketplace PR branch, add the
   `thread-management` category, and validate the local metadata diff as far as
   possible before the public v0.1.1 tag exists.
7. Present the exact release account, repository, commit, package/version,
   source/tag, marketplace branch, and remote-changing commands for explicit
   approval.
8. After approval, push the source release commit and annotated tag, verify the
   immutable public refs, rerun the marketplace's full source-aware checks,
   commit/push the category correction, and reply to PR #162 requesting another
   managed installation check.
9. Confirm the PR's latest CI and review state, then complete the Empirical
   capability integration with evidence receipts and report any remaining
   maintainer-only action.
