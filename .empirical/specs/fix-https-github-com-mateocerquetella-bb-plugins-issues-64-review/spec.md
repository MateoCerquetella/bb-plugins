# Fix Https Github Com Mateocerquetella Bb Plugins Issues 64 Review

## Request

> Fix https://github.com/MateoCerquetella/bb-plugins/issues/64, review every other open pull request, address necessary changes where appropriate, and merge only the pull requests that are ready and safe to merge.

## Goal

Restore Usage Tracker's sidebar response when BB cannot completely attribute
active threads, publish the correction as the next patch version, and dispose
of every currently open pull request according to review evidence rather than
merging unfinished or failing work.

## Acceptance Criteria

- [ ] [AC-1] When provider activity attribution is incomplete, providers whose
  activity is unknown omit the `inUse` property rather than returning an
  explicitly present `undefined` value.
- [ ] [AC-2] A Usage Tracker snapshot with incomplete activity attribution can
  cross BB's JSON RPC boundary without changing its provider data.
- [ ] [AC-3] Providers known to be active still return `inUse: true`, and a
  complete activity count still marks inactive providers `inUse: false`.
- [ ] [AC-4] Regression coverage fails if unknown activity is represented by an
  own `inUse` property or any other non-JSON value.
- [ ] [AC-5] Usage Tracker is versioned and documented as the next patch
  release containing the JSON-safe unknown-activity correction.
- [ ] [AC-6] Every open pull request observed at the start of this work is
  reviewed at its exact head and is either merged with passing verification or
  left open with its concrete blocker recorded.
- [ ] [AC-7] Dockside projects without threads remain visible as launchers and
  remain discoverable when their project name matches search.
- [ ] [AC-8] Draft, conflicted, failing, or explicitly incomplete pull requests
  are not forced into `main`.
- [ ] [AC-9] The integrated `main` branch passes the focused Usage Tracker and
  Dockside checks plus the repository root check.

## Scope

- `plugins/usage-tracker/lib/load-usage.ts`
- Usage Tracker activity and JSON-safety tests
- Usage Tracker patch-version metadata and changelog
- Review and safe integration of open PRs #57, #66, and #69
- The focused Dockside correction and regression test required to make #66
  mergeable
- GitHub issue/PR status updates that reflect the integrated result

## Non-goals

- Completing the broad Agent Canvas parity work in PR #69
- Rewriting or narrowing the draft Taskboard work in PR #57
- Changing the meaning of unknown provider activity in the frontend
- Refactoring unrelated Usage Tracker, Dockside, Taskboard, or Empirical code
- Bypassing branch protection, requested changes, or failing CI

## Verification

- Run `npm run check --workspace bb-plugin-usage-tracker`.
- Run `npm run check --workspace bb-plugin-dockside`.
- Run `npm run check` from the workspace root after integration.
- Exercise a snapshot with incomplete thread attribution and assert both
  `JSON.stringify`/`JSON.parse` round-tripping and absence of own `inUse` keys.
- Re-read the open PR inventory, reviews, mergeability, and CI status before
  each merge.
## Capability Deltas

- `deltas/usage-tracker-provider-usage.md`
- `deltas/dockside-thread-management.md`
