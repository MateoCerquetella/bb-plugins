# Native Progress Checkpoint

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
