# Installed Repair

## Source

- Baseline: BB `desktop-v0.45.0`,
  `129f621771a3e275773992db648316966ac207cf`.
- Port checkout: `/tmp/bb-0.45.0-port-1790989929`.
- Durable patch: `plugins/action-topbar/patches/bb-0.45.0-action-drag.patch`.
- Restored bounded content-script bridge, host-owned Action panes, routing and
  persistence, release capture, and terminal startup using 0.45.0 APIs.
- Added abort-signal cancellation for an Action drag on plugin generation
  teardown, including late plugin-panel callbacks.

## Checks

- 205 host tests passed across 16 focused files.
- 57 SDK app harness tests passed.
- After abort cleanup was added, 79 affected drag/reload tests passed.
- Final app and SDK typecheck/build: 7 Turbo tasks successful.
- Action Topbar typecheck, 26 tests, and build passed.
- Raw logs and install manifest are in `evidence/`; collection as an Empirical
  receipt was refused at Implement and must occur at an eligible later gate.
- Target sync fetched origin/main and reported current, no merge or conflict.

## Installation

Installed at
`/home/dyaus/.local/share/bb-releases/0.45.0/node_modules/bb-app/app/dist`.

Original frontend backup:
`/home/dyaus/.local/share/bb-releases/0.45.0/node_modules/bb-app/app/dist.before-action-drag-2026-10-03T01-32-09.889Z`.

All 1,676 built files were hash-checked during staging. Old hashed chunks were
retained for already-open clients. The running server returned HTTP 200 with
the exact installed index hash:
`1805c38321a1fdb92447b5da645049ecd5e3558de0e8dac6566e28da2d342d21`.

## Remaining Human Step

Reload the user's BB tab to load the repaired frontend. The project-bound
Steel browser reaches `https://cerq.getbb.app/` but displays BB Connect's
sign-in page. The user must sign in inside the embedded browser before a live
Action drag and screenshot can be verified. No UI success is claimed.
Fresh-context review and final workflow verification/integration remain pending.
