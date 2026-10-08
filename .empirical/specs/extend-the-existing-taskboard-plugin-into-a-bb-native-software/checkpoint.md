# Native Progress Checkpoint

## Automatic Continuation And Tracker Status Follow-Up

Continued from `thr_dy84xshx5z` in `thr_4cdin3vcbr` on 2026-10-08.
The user's latest request supersedes the earlier manual investigation/plan/build
gates: starting a task should move its provider status to In progress and
automatically continue through planning into Build. The user also requested a
Kanban Start task action and row metadata in narrow issue panels. Existing
installation/reload authorization was retained.

- Start task dispatches once and updates only a provider-supported In progress
  transition after confirmed dispatch. Status errors have their own retry.
- Investigation and planning automatically continue in the linked session.
  Planning saves and approves its exact digest before Build. Existing linked
  investigation/planning records adopt the requested automatic behavior.
- A plain project checkout now forks Build into a managed worktree while
  retaining the planning conversation and durable ticket/thread links. Known
  preflight environment rejections are retryable; lost responses remain
  uncertain and never automatically dispatch again.
- Kanban cards expose Start task. Narrow details use wrapping metadata rows;
  desktop details retain the aside. Fixed the browser fixture's shared-object
  update and loaded the pinned BB stylesheet and TooltipProvider.
- Current root `npm run check` exited 0. Taskboard checks passed types, all 166
  tests, build and metadata verification. `git diff --check` passed.
- Steel component checks passed 1280px, 800px and 390px layouts, realtime status,
  native navigation, Kanban start, stale approval and automatic-action states.
  These are component fixtures, not authenticated BB panel-host evidence.
- Installed and reloaded the existing local Taskboard successfully, with all
  three services running. SDD-134's real provider/cache status is In Progress;
  its existing plan is saved as revision 1 and the factory reached Build.
- Actual Build dispatch was rejected before session creation: the configured
  empirical-sdd checkout has a `.git` file pointing to the missing
  `/home/dyaus/Developer/projects/empirical-sdd/.git`. Confirmed native environment
  status reports `not_git_repo`. The stored Build failure is now explicitly
  retryable, with no new thread. Asked for the correct checkout path; no target
  repository or project-source configuration was changed.
- Actual BB URL inspection reached the Connect sign-in gate. Independent
  revision-bound verification, PR evidence, accepted review and Done gates
  remain outside this completed follow-up slice; the broader specification is
  not certified complete.

Logs, screenshots, installation results and sanitized live status are under
`/home/dyaus/.bb/thread-storage/thr_4cdin3vcbr/`:
`taskboard-followup-{root-check,check,browser-check}.log`,
`taskboard-progress-{desktop,panel,mobile}.png`,
`taskboard-followup-{install,reload,live-status}.json`.

## Dispatch And Compact Panel Repair

Follow-up after the user still observed the old frontend:

- Simplified further to an Agent summary and actions, with evidence behind
  Run details. Reinstalled the same local plugin, preserving its data.
  Installed asset hash: `afcb0160e58f492a`.
- Added `FACTORY_SMOKE_NO_CONTEXT=1` to the native harness. Actual no-context
  dispatch completed in `thr_nk5qcw3376`, worktree `env_ufrhq9xc9e`; persisted
  finished outcome at cursor 151, Triage stage, Open synthetic tracker status,
  and durable linkage. Independent work-status check confirmed zero changes.
- Types, 155 tests, build, metadata and desktop/mobile component checks passed.
- The real stored missing-host failure remains retryable, version 3. It was
  not retried automatically. Authenticated client remount is not verified;
  a stale frontend is a hypothesis based on the old screenshot, not proven.

Continued in `thr_39bbndt84c` after the previous provider connection failed.
The user had approved fixing the no-thread dispatch and reducing the progress UI.

- Initial dispatch without a current thread now uses the SDK's
  `project-default` environment instead of an incomplete host workspace.
- The exact known missing-host HTTP 400 is retryable. Existing unlinked
  uncertain records with that rejection are normalized without dispatching.
  Other ambiguous responses retain the no-duplicate-dispatch guard.
- Replaced the vertical stage list and metadata table with a compact,
  wrapping status row.
- Taskboard SDK pin check, types, all 155 tests, build and metadata check passed.
  `git diff --check` passed.
- Steel component verification passed at 1280px and 390px, including native
  navigation recording and stale plan approval. Screenshots are in
  `/home/dyaus/.bb/thread-storage/thr_39bbndt84c/taskboard-progress-{desktop,mobile}.png`.
  This remains a component harness, not authenticated live-panel verification.
- Reloaded the already-installed local plugin successfully; all three services
  are running. Readback confirmed the real unlinked failed dispatch changed
  from uncertain to failed at version 3. No real task was launched or tracker
  item changed.
- No whole-repository check or new real no-thread dispatch was run in this
  continuation. The broader factory acceptance criteria remain incomplete.

## Live Installation Follow-Up

On 2026-10-08 the user explicitly selected "Install and reload" for the
integrated local build. The installation now points to this worktree's
`plugins/taskboard`, and `bb plugin reload taskboard` succeeded with
`taskboard-factory-progress`, `preparation-jobs`, and `sync` running.

- Imported the installed preparation source and retained its uncommitted
  composer UI behavior without modifying its original checkout.
- The integrated Taskboard check passed 153 tests, types, build, and metadata
  verification. Log: `$BB_THREAD_STORAGE/taskboard-install-check.log`.
- Initial installs were rejected by migration guards and retained the old
  installation. Restored immutable historical migrations and preserved the
  reverted Work-board migration when its exact known hash is recorded.
- Tested startup twice against an isolated SQLite backup of the actual
  installation: checked table counts preserved, integrity check OK, 12
  migrations recorded. Added an automated historical-upgrade regression.
- Final installation and reload succeeded; settings, secrets and schedules
  were retained by BB. No real task was dispatched or tracker item changed.
- Steel inspection of the actual BB URL reached its sign-in gate. Authenticated
  panel verification remains pending; no authentication bypass was attempted.
- Threads dispatched by the previous version are not automatically linked to
  factory progress records.

The historical sections below describe the earlier draft checkpoint.

## Delivered In The Draft Branch

Commit `11211cc7e` on `taskboard-with-mastra-factory-thr_suvnn4i6np`.
Draft PR: https://github.com/MateoCerquetella/bb-plugins/pull/72

- Native investigation dispatch from Send to agent, managed worktree selection,
  native navigation and existing right-panel pin behavior.
- Persistent ticket/thread association and native event progress.
- Findings, native plan steps, command results, reported changed files and
  exact-revision plan approval; linked authoring/review sessions.
- Serialized and persisted dispatch intent, duplicate suppression, bounded
  retry and conservative ambiguous-start recovery.
- No tracker mutation, merge, deployment, automatic acceptance or Done action.

PR #57 supplied reviewed lifecycle concepts, not copied runtime code:
project/source/locator identity, durable linkage, digest approval and serialized
operations. Its Symphony runtime, Empirical prompt injection and automatic
provider completion were not imported. Existing preparation data is untouched;
the installed preparation UI has not been integrated into this candidate yet.

## Checks Actually Run

- Root `npm install --prefer-dedupe` completed. npm reports six pre-existing
  dependency audit findings (four moderate, two high); no broad audit fix run.
- Root `npm run check` exited 0. Log:
  `$BB_THREAD_STORAGE/root-check-final.log`.
- Final Taskboard `npm run check --workspace bb-plugin-taskboard` exited 0:
  types, 145 tests, build and metadata verification. Log:
  `$BB_THREAD_STORAGE/taskboard-check-final.log`.
- `git diff --check` passed.
- Empirical target sync with fetch reported already current with `origin/main`.
- Steel real-component harness passed 1280px and 390px layouts, no horizontal
  overflow/page errors, native navigation recorder, plan revision and stale
  approval invalidation. Screenshots are in thread storage:
  `taskboard-progress-desktop.png`, `taskboard-progress-mobile.png`.
  BB hook bindings are mocked here; this does not establish live BB host-panel
  integration. No browser server or alternative plugin was installed.

## Actual Native Execution

Ran the production factory service with the real public BB SDK and an isolated
SQLite database on a synthetic item. No tracker adapter was called.

- Thread: `thr_dfhb2rpxtu`.
- Environment: `env_2qbrytmtes`, BB-managed Git worktree.
- Duplicate dispatch returned the existing link.
- Successful terminal event observed at sequence 196.
- Persisted result: run finished, factory Triage, tracker Open, link retained.
- Agent reported package name and verification script by read-only inspection.
- Independently checked the smoke worktree was clean after execution.

The first poll requested 200 events and received a real HTTP 400 because BB
caps the limit at 100. Fixed the production limit, restarted only the harness,
and reconciled the same session. No second native thread was dispatched.
The browser run also caught a details/summary double-toggle; fixed with an
explicit controlled disclosure and reran successfully.

## Not Yet Established

The broader 17-criterion specification is not complete:

- Configurable automatic stage policies.
- Independent verification bound to implementation revision and approved scope.
- PR evidence capture and stale verification invalidation.
- Explicit work acceptance, accepted review and Done transitions.
- Full native investigation/plan/build/review demonstration.
- Fresh-context independent review and live BB panel-host validation.
- Selective integration of the user's installed preparation UI and edits.

No live installation was replaced or reloaded. No real tickets were closed,
no code merged, no deployment performed. Unrelated Empirical journal
compaction changes remain unstaged and were excluded from the PR.
