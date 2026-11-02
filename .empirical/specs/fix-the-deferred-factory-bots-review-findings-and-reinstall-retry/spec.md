# Factory Bots Follow-Up Fixes

## Request

> Fix the deferred Factory Bots review findings and reinstall: retry one failed ticket detail read; preserve a non-default FACTORY_URL in the offline start command; pass a minimal environment to the MCP child and fail pending calls on stdout/stderr errors; keep one poll loop across route changes; remove the unused storage path from the board snapshot; make a missing MCP script an actionable config error; add focused regression tests; rebuild, install, and reload the plugin.

## Goal

Apply the non-blocking hardening findings from the first Factory Bots review
without changing the approved board behavior, then reinstall and reload the
plugin from this checkout.

## Acceptance Criteria

- [ ] [AC-1] A failed `factory_ticket` detail read in `getBoard` is retried once;
  a second failure still returns the board's not-running/unavailable result. A
  mixed test where one ticket fails and another succeeds proves the retry path.
- [ ] [AC-2] The offline start command preserves a non-default `FACTORY_URL`
  from `factory.mcp.json` as a shell-quoted `FACTORY_URL=...` prefix; the
  default `http://127.0.0.1:8080` stays omitted, and a config test proves both.
- [ ] [AC-3] The MCP child receives only a minimal base environment plus the
  config's `env`; a sentinel secret in the BB process is not visible to the
  child. A stdout or stderr pipe error rejects in-flight calls and stops the
  child instead of becoming an unhandled rejection.
- [ ] [AC-4] The panel keeps one poll loop for its lifetime. Navigating between
  board, agent, and ticket routes does not start a second loop or overlap board
  reads; selecting a ticket wakes the loop and fetches the new ticket promptly.
- [ ] [AC-5] `BoardSnapshot` no longer carries the factory storage path over
  RPC; the panel still shows the same header and cards.
- [ ] [AC-6] If the configured MCP script path does not exist, the panel shows
  an actionable config error naming the missing path and
  `FACTORY_BOTS_MCP_CONFIG`, not a generic unavailable wall.
- [ ] [AC-7] Focused typecheck, tests, and `bb plugin build` pass. The post-fix
  install, reload, browser QA, and screenshot evidence are recorded during
  Verify.

## Scope

- `plugins/factory-bots/lib/service.ts`, `lib/config.ts`, `lib/mcp-client.ts`,
  `lib/derive.ts`, `contract.ts`, `app.tsx`.
- Focused tests in `plugins/factory-bots/test/`.
- The follow-up spec, design, plan, review, and verification evidence.

## Non-goals

- Changing the operator-supplied factory checkout path in `factory.mcp.json`.
- Changing the repository-wide SDK pin or upgrading `bb-app`.
- New board features, new MCP tools, or any write path.
- Opening a pull request or merging.

## Verification

- `npm run check --workspace bb-plugin-factory-bots` (tsc, node tests, build).
- Focused tests for retry, start-command env, minimal environment, storage
  removal, and missing-script config errors.
- `node .empirical/specs/build-a-bb-plugin-called-factory-bots-that-shows-the/qa/browser.mjs`
  for the UI refresh, ownership, and state checks.
- Reinstall and reload, then open the panel.

## Capability Deltas

- `deltas/factory-bots-board.md`
