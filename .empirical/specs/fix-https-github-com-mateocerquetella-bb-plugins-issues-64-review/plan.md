# Plan

1. Add failing Usage Tracker tests covering missing/rejected counts, unknown
   provider IDs, known activity, stale booleans, and JSON round-trip identity.
2. Remove unknown own activity properties; prepare 0.1.15 metadata/changelog.
3. Add a standalone Dockside search regression and fix the predicate. Preserve
   PR 66's contribution for separate integration.
4. Install workspace dependencies and run focused tests, typechecks, builds,
   and root checks. Dockside has no standalone check script: use the root
   `check:dockside` orchestration, which runs its tests/typecheck/build.
5. Obtain fresh-context review and immutable evidence receipts. Refresh context
   as required by the workflow.
6. Commit only this feature's files, push and open a fix PR. Merge after green
   CI, then verify PR 66 against corrected main and merge only if ready.
7. Keep PRs 57 and 69 open with recorded blockers; verify final main and record
   issue closure and merge receipts.
