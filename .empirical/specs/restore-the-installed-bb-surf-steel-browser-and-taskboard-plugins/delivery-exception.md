# PR preparation exception

On 2026-10-19 the user requested: "Push it PR we can skip this validaiton".

The duplicate-issue finding F-1 was repaired by deduplicating combined GitHub
snapshots by locator. The stale recovery documentation was corrected.
Neither repair has been re-reviewed or tested.

Tests, typecheck, build, live Taskboard refresh, and a second independent review
are not claimed as passing. Failure-boundary test coverage remains incomplete.
The original CHANGES_REQUESTED review is preserved.

Empirical refused to skip Review. The feature was paused through
empirical_direct before preparing the PR outside the verified delivery flow.
This exception authorizes PR preparation only, not merge, release, publication,
or changing the installed Taskboard source.
