# Autonomous Taskboard factory implementation plan

## 1. Define the domain contract

- Add schemas for project policy, admission origin, scan observation, computed
  status, and RPC inputs and outputs in `plugins/taskboard/factory/contract.ts`.
- Default existing records to manual admission and all projects to disabled.
- Bound automatic concurrency and keep the first intake policy fixed to `todo`.
- Add contract tests for defaults, invalid input, and round trips.

## 2. Prove durable admission

- Add project policy and scan observation tables to
  `plugins/taskboard/factory/store.ts`.
- Add policy read, save, and list operations.
- Add one atomic admission operation that verifies policy, checks capacity, and
  inserts the existing `FactoryRecord`.
- Count only active factory-owned records against automatic capacity.
- Test duplicate admission, final-slot races, restart persistence, disabled
  policy, and provider mismatch with real SQLite connections.

## 3. Add autonomous controller behavior

- Extend `plugins/taskboard/factory/service.ts` with one bounded project scan.
- Accept provider boundaries for candidate listing and live item reads.
- Revalidate source, state category, and scope before admission.
- Start the existing investigation path only after the durable claim commits.
- Revalidate factory-owned records before later automatic stages.
- Stop later automatic dispatch when intake is paused or the live ticket is
  missing, closed, canceled, or changed.
- Preserve native observation, uncertain dispatch, manual starts, managed Build
  worktrees, review, and bounded repair.

## 4. Wire server scheduling and public interfaces

- Provide canonical project provider, candidate list, and live read functions
  from `plugins/taskboard/server.ts`.
- Run admission before the existing factory poll and isolate errors per project.
- Add RPC handlers for factory settings, status, and a bounded diagnostic tick.
- Add matching Taskboard CLI commands through the existing CLI registration.
- Publish the existing factory realtime event after policy or status changes.

## 5. Add project Manage controls

- Add an unframed factory settings section to the existing project Manage view
  in `plugins/taskboard/app.tsx`.
- Show the configured provider, enable switch, bounded concurrency input,
  computed status, active count, and blocked reason.
- Reuse existing form, feedback, badge, and responsive layout patterns.
- Keep the save action explicit and accessible on desktop and mobile.

## 6. Document and verify the behavior

- Update `plugins/taskboard/README.md` with enablement, safety boundaries, and
  the project-local claim limit.
- Extend the browser fixture for factory settings and status.
- Run focused tests while implementing.
- Run the Taskboard package check from the workspace root.
- Install and reload the local Taskboard plugin.
- Exercise the Manage controls at desktop and mobile widths with BB Surf and
  inspect screenshots.
- Run the opt-in native smoke only when the current BB environment supports it.

## Affected tests

- plugins/taskboard/test/factory.test.ts
- plugins/taskboard/test/contract.test.ts
- plugins/taskboard/test/settings.test.ts
- plugins/taskboard/test/app-ui.test.ts
- plugins/taskboard/scripts/factory-browser-check.mjs
