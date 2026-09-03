# Fix Touch Bar Auto Reconnect After Prolonged Uptime Or Transient

## Request

> Fix Touch Bar auto-reconnect: after prolonged uptime or transient BB CLI/server failures, the native companion must retry automatically with bounded backoff, recover connected state and refresh cards when BB is healthy again, and avoid permanently showing Reconnecting while commands work. First commit all currently present worktree files. Then implement and test retry/recovery behavior, rebuild/install on the enrolled Intel Mac, and record logs and verification.

## Goal

After any transient BB CLI/server failure, the native companion continues
polling with bounded backoff, automatically returns to connected state after a
successful poll, and refreshes visible cards without an app restart or manual
toggle.

## Acceptance Criteria

<!-- Replace this comment with observable criteria such as:
- [ ] [AC-1] The user can complete the intended action.
- [ ] [AC-UI-1] [UI] The result is visible in the browser.
-->

## Acceptance criteria

- [ ] [AC-1] Three consecutive snapshot failures show reconnecting while the
  last good cards remain available.
- [ ] [AC-2] Polling continues after reconnecting with bounded backoff and does
  not permanently stop after a failure streak.
- [ ] [AC-3] A successful snapshot clears reconnecting state and refreshes the
  panel and accessory counts automatically.
- [ ] [AC-4] Timeouts, nonzero exits, malformed output, and missing executables
  are handled without a crash or overlapping poll loop.
- [ ] [AC-5] Direct Touch Bar delivery, finger scrolling, completed taps,
  acknowledged-error filtering, and exact-id BB actions remain intact.
- [ ] [AC-6] Tests cover failure streaks, backoff/retry, recovery, and last-good
  state retention; plugin and root checks pass.
- [ ] [AC-7] The corrected native app is rebuilt, installed, and observed on the
  enrolled Mac with logs proving failed-poll recovery.

## Scope

- `plugins/touchbar/native/Sources/AgentModel.swift` and focused tests.
- Native polling/backoff behavior and Intel Mac installation evidence.
- Empirical specification, delta, receipts, and review records.

## Non-goals

- No new BB server API or storage access.
- No unbounded retries, busy loops, or command-semantic changes.
- No deletion of user concept files or unrelated plugin changes.

## Verification

- Run Touch Bar tests and `npm run check` from the workspace root.
- Exercise injected snapshot failures and recovery in unit tests.
- Rebuild/install on the enrolled Mac and inspect reconnect/recovery logs.
- Complete fresh-context review and integration.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
