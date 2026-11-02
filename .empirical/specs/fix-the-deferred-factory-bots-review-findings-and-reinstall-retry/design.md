# Design

## Service retry

Add a private `readDetail(linearId)` in `FactoryService` that calls
`factory_ticket` and, on any failed read, calls it once more before returning
the failure. `getBoard` uses it inside the existing bounded `mapLimit`; the
existing `detailFailures` handling is unchanged, so a second failure still fails
the board closed. `getTicket` keeps its single detail read (a user-visible
click already surfaces the error directly).

## Start command

`startCommand(config)` keeps deriving `... up` from the MCP argv. If
`config.env.FACTORY_URL` exists and differs from the factory's default
`http://127.0.0.1:8080`, prefix `FACTORY_URL=<shell-quoted value> ` to the
rendered command. Other env keys are never printed, so no secret can leak into
the panel.

## MCP child environment and pipes

`FactoryMcpClient.start` builds the child env from a small allowlist (`PATH`,
`HOME`, temp dirs, locale, timezone, user/shell, and Windows equivalents) and
then `config.env`. It no longer spreads all of `process.env`. stdout and stderr
get `error` listeners mirroring the existing stdin guard: clear the current
child, terminate it, and reject pending calls. A test-only fake tool exposes
whether a sentinel parent variable reached the child.

## Single poll loop

Replace the effect keyed on `linearId` with one loop mounted for the panel's
lifetime:

- `linearIdRef` always points at the current selection.
- The loop awaits `getBoard`, then the selected `getTicket`, then schedules the
  next 5s tick.
- A `wakeRef` lets a route change clear the timer and run a cycle immediately.
  If a cycle is already in flight, it sets a queued flag so the loop runs again
  after the current cycle instead of starting a second one.
- A small effect resets the ticket state when `linearId` changes and wakes the
  loop (skipping the first mount).

The ticket pane already rejects stale or wrongly-owned ticket data, so a result
from the previous selection cannot paint under the new route.

## Snapshot and config errors

Remove `storage` from `BoardSnapshotSchema`, `deriveSnapshot`, and its tests; the
panel never rendered it. `loadMcpConfig` checks that the resolved script path
exists when the command is an absolute/relative file path, returning an
actionable error that names the path and `FACTORY_BOTS_MCP_CONFIG`. A missing
Node binary remains a spawn error, not a config error.

## Verification

Focused node tests cover retry success/failure, start-command URL rendering,
minimal env, storage removal, and missing-script config. The existing browser
QA proves the single loop and 5s refresh. Then `npm run check`, reinstall, and
reload.
