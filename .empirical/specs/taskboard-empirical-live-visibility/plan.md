# Implementation Plan

## Preconditions

- Transfer this exact Empirical feature into a clean isolated worktree based
  on current `origin/main` before editing plugin source. Its Start task and
  factory-progress implementation is absent from the initial `9614dd5` base.
- Preserve existing `.empirical` reconciliations in the current checkout;
  do not reset, stash, or fold unrelated migrated records into Taskboard
  source commits.

## Tasks

### T1: Add host-scoped Empirical observation

- Add the pinned `empirical-sdd` runtime dependency to Taskboard.
- Extend the Taskboard host contract with bounded read-only overview and
  watch setup/teardown operations.
- Resolve and validate the host-side real checkout root, use
  `repositoryOverview`, and return the selected copy plus owner conflicts,
  issue diagnostics, host identity and observation time.
- Test initialized, uninitialized, unsafe, invalid and conflicting fixture
  repositories. Verify no `.empirical` writes occur.

### T2: Link observation to factory runs

- Extend the factory RPC and durable record with a backward-compatible,
  validated last-observation projection.
- Resolve every run's BB environment server-side, route only to its host,
  and reject project or environment mismatches.
- Refresh on host watch generation and reconcile periodically/reconnect;
  persist changed facts, publish `taskboard:factory`, and retain but mark
  the last valid fact stale/offline after failures.
- Test dispatch identity, stale recovery, duplicate feature ownership,
  schema rejection, version migration, and no false completion.

### T3: Render Empirical state beside native progress

- Extend `FactoryProgress` with a compact Empirical section and explicit
  labels for feature, revision, phase, status, verification, completion,
  checkout, host and freshness.
- Keep BB agent phase/activity, provider ticket state and Empirical state
  separate; link to the owning BB thread where a run is present.
- Test active, awaiting-human, blocked, implemented-only, verified Done,
  merged-but-unclosed, stale, offline, uninitialized and conflict states.
- Exercise reconnect and ensure native task controls retain current behavior.

### T4: Prove the full workflow in an isolated demo

- Build a fixture containing a BB project/ticket, native run events, and an
  Empirical repository whose journal can advance through running,
  awaiting-human, implemented and verified completion states.
- Exercise the actual Taskboard progress component using its browser
  harness at desktop and narrow pinned-panel sizes.
- Use isolated storage and local fixture providers; never launch paid agents,
  write a real Empirical checkout, or change a real tracker.
- Capture screenshots and record exact browser/demo and focused test results.

### T5: Document, validate and integrate

- Document setup, host scope, freshness semantics, limits and demo command.
- Run focused observer/service/UI tests, all Taskboard workspace checks and
  the required plugin build/type validation.
- Install and reload the local Taskboard plugin; verify the actual panel and
  CLI in BB, and inspect screenshots for layout and state truth.
- Collect required immutable evidence, complete review/verification gates,
  and integrate only against the exact reviewed current target.

## Sequencing

T1 and T2 are prerequisites for T3. T4 follows the complete flow. T5 closes
the feature. Do not treat mock-only browser evidence as proof of host delivery.

## Rollback

Remove the Empirical host observer, optional factory observation field and
panel section, plus their tests/demo/docs. Existing Taskboard factory
dispatch, native progress and ticket-state synchronization remain unchanged.
