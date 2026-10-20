# Autonomous Taskboard factory implementation plan

## Implemented baseline to preserve

The current source already implements project policies, disabled defaults,
provider admission, atomic SQLite capacity reservation, live revalidation,
pause, CLI/RPC settings, and Manage controls. Keep those operations and their
existing tests. This increment adds coordinator hierarchy and fixes two intake
gaps: claim filtering before the scan window, and workflow blockers surviving a
healthy scan. The service remains the sole scheduler.

## Throughput checkpoint

- Blocking first steps: settle compatible coordinator schemas and prove atomic
  starting-intent ownership and reverse indexing with real SQLite before native
  dispatch. Complete service behavior/tests before UI dispatch uses the contract.
- Independent workstreams: after the service contract settles, UI/navigation and
  documentation/browser scenarios can proceed with separate file ownership.
  The service owner retains race/recovery tests. One owner regenerates SDK types.
- Shared mutable state: the existing versioned SQLite record and thread index
  own dispatch. Only the successful compare-and-swap writer may spawn. Losing
  owners reload. Native threads and provider reads remain external state.
  Serialize edits to shared contract, service, server, and fixture files.
- Smallest safe decomposition: one owner completes units 1 through 3 together,
  then one UI owner completes unit 4 and fixtures. Review the combined result.
  Keep coordinator creation, uncertainty, and recovery in one cohesive lifecycle.

## 1. Define coordinator state and durable ownership

- In `plugins/taskboard/factory/contract.ts`, define the accepted Zod coordinator
  union outside stage-only `runs`: pending, starting, uncertain, failed, ready.
  Missing historical fields parse as null. New manual records in
  `plugins/taskboard/factory/state.ts` and admissions in
  `plugins/taskboard/factory/store.ts` initialize pending.
- Keep stage selection, approval, review, and capacity meanings unchanged. Root
  initialization and completion are not stage evidence or another capacity slot.
- Extend the store's transactional save/index path to include ready coordinator
  IDs. Reject ownership conflicts without changing the record or index.
- Add validated versioned RPC inputs for explicit adoption, confirmed retry, and
  uncertain recovery. Recovery binds the coordinator intent and record version.
- Extend `plugins/taskboard/test/contract.test.ts` and
  `plugins/taskboard/test/factory.test.ts` for legacy parsing, union round trips,
  root/worker lookup after reopen, conflict rollback, and stale-save rejection.
  Use two SQLite connections to prove winner-only starting-intent persistence.

Observable check: old records load without native calls, and root plus workers
resolve the same ticket without stealing another ticket's thread.

## 2. Implement coordinator creation, child dispatch, and recovery

- Extend `plugins/taskboard/factory/service.ts` inside its existing ticket lock.
  Persist a unique starting intent before native creation. Only the successful
  versioned writer spawns; reload after losing a concurrent save.
- Create the root with project defaults, project-default environment, the unique
  ticket/intent title marker, and the short nonempty initialization prompt.
  Persist its native ID before the first worker. Root creation does not update
  provider progress.
- Set `parentThreadId` on every new worker. Preserve author context/defaults,
  managed Build isolation, Review independence/workspace identity, and repair
  and continuation sends to the original Build session.
- Validate root availability/project before dispatch and grouped worker parentage
  before reuse. Continue observing existing workers when dispatch is blocked.
- Keep known preflight rejection retryable only by explicit action. Treat lost
  responses, restarting starting intents, and post-spawn persistence failures as
  uncertain. Never automatically create a replacement root or worker.
- Implement explicit recovery checks for identity, version, intent marker,
  project, creation window, availability, and ownership. Implement repeatable
  legacy adoption without reparenting history, changing evidence, or replacing
  a reused historical Build.
- Extend `plugins/taskboard/test/factory.test.ts` to retain every spawn argument
  and native parent metadata. Race two service owners sharing real SQLite.
  Cover intent/spawn/save crash windows, reload, lost responses, invalid/successful
  recovery, unavailable roots, parent conflicts, and root terminal states.
- Adjust stage tests for the additional root and assert all new worker parents.
  Preserve existing manual, worktree, repair-limit, uncertain-dispatch, provider
  progress, and acceptance tests. A reused legacy Build remains visibly legacy.

Observable check: one root and first worker survive concurrent owners/restart;
every new worker has that native parent, while ambiguity remains blocked.

## 3. Wire public operations and finish intake observability

- Wire adoption, coordinator retry, and recovery RPCs in
  `plugins/taskboard/server.ts` through validated service methods. Preserve the
  existing project factory CLI and realtime event publication.
- In `plugins/taskboard/factory/service.ts`, exclude durable claims before the
  bounded candidate window. Retain live eligibility and scope checks.
- In `plugins/taskboard/factory/store.ts`, include queue-owned coordinator,
  uncertain-stage, and automation blockers in project status after healthy scans.
  Keep distinct disabled, paused, configuration, provider, and scan error states.
- Extend `plugins/taskboard/test/factory.test.ts` with a fully claimed first
  window followed by eligible tickets, a healthy scan with blocked workflow,
  pause while observing workers, failed live reads, changed scope/closure,
  wrong provider, capacity, and failure isolation. Retain admission race tests.
- Extend `plugins/taskboard/test/contract.test.ts` for new RPC validation.
  Refresh generated types with
  `npm run types:refresh --prefix plugins/taskboard`; do not hand-edit them.

Observable check: claimed early tickets cannot starve later tickets, a healthy
scan cannot hide a blocked team, and stale or paused work dispatches no new agent.

## 4. Render grouped ticket teams and correct navigation

- In `plugins/taskboard/factory/app.tsx`, render coordinator and role-labelled
  worker rows with native state and direct actions. Waiting roles have no fake
  links. Show blockers above the group and in its collapsed summary.
- Update `plugins/taskboard/factory/navigation.ts` and
  `plugins/taskboard/app.tsx` so Start opens the ready root, worker actions open
  their own native thread, and legacy records keep their fallback destination.
- Add explicit adoption/retry/recovery controls and accurate legacy labels.
  Key disclosure state by ticket identity to retain expansion across refresh.
- Reuse `plugins/taskboard/app.css` conventions and
  `plugins/taskboard/factory/project-settings.tsx` for readable project blockers.
  Keep keyboard focus, wrapping, and narrow-screen behavior accessible.
- Extend `plugins/taskboard/test/factory-preview.tsx` and
  `plugins/taskboard/test/factory-preview-runtime.tsx` with ready, pending,
  uncertain, unavailable, adopted-legacy, paused, scope-changed, and closed teams.
  Record actual root/worker navigation destinations in the fixture.
- Extend `plugins/taskboard/test/factory-navigation.test.ts` and
  `plugins/taskboard/test/app-ui.test.ts` for changed navigation/UI contracts.

Observable check: keyboard users can expand a group and open the root or a
specific worker; refresh retains expansion and blocked groups retain a reason.

## 5. Verify the installed behavior and obtain independent review

- Update `plugins/taskboard/README.md` with coordinator ownership, legacy
  adoption, uncertainty recovery, shared-database limits, pause, and acceptance.
- Run focused tests with
  `node --test --experimental-strip-types plugins/taskboard/test/factory.test.ts plugins/taskboard/test/contract.test.ts plugins/taskboard/test/factory-navigation.test.ts plugins/taskboard/test/app-ui.test.ts plugins/taskboard/test/settings.test.ts`.
  Then run `npm run check --prefix plugins/taskboard` and required root
  `npm run check`. Save actual command evidence.
- Install `./plugins/taskboard`, reload `taskboard`, and inspect factory CLI
  status without enabling a live provider queue.
- Extend `plugins/taskboard/scripts/factory-browser-check.mjs` and run through
  BB Surf's bound project browser. Capture desktop/mobile evidence for healthy
  idle, paused, missing configuration, provider error, uncertain coordinator,
  scope change, and closure change. Assert role labels, direct destinations,
  retained disclosure after refresh, keyboard focus, and no horizontal overflow
  with long ticket titles, provider names, and reasons. Inspect screenshots.
- Extend `plugins/taskboard/scripts/factory-native-smoke.ts` using an isolated
  database and synthetic ticket. Where BB context permits, inspect actual native
  root/child parent IDs and execution environment IDs. Prove nonempty root
  initialization, usable parentage, and root completion without ticket completion.
  Make no provider calls. Record unsupported host behavior as unverified.
- Obtain fresh-context review of the exact implementation and acceptance
  evidence with the thermonuclear quality bar. Fix accepted blockers and rerun
  affected checks. Complete Empirical Review/Verify using actual receipts.
- Integrate the reviewed capability delta through Empirical. Run No Mistakes
  when configured prerequisites and the authorized delivery ceiling permit it.
  Never infer native behavior from mocks or claim a gate before it runs.

## Affected tests

- plugins/taskboard/test/factory.test.ts
- plugins/taskboard/test/contract.test.ts
- plugins/taskboard/test/factory-navigation.test.ts
- plugins/taskboard/test/settings.test.ts
- plugins/taskboard/test/app-ui.test.ts
- plugins/taskboard/scripts/factory-browser-check.mjs
- plugins/taskboard/scripts/factory-native-smoke.ts
