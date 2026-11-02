# Plan

## Affected tests

- `plugins/factory-bots/test/service.test.ts`
- `plugins/factory-bots/test/config.test.ts`
- `plugins/factory-bots/test/mcp-client.test.ts`
- `plugins/factory-bots/test/derive.test.ts`
- `plugins/factory-bots/test/fixtures/fake-mcp.mjs`
- `.empirical/specs/build-a-bb-plugin-called-factory-bots-that-shows-the/qa/browser.mjs`

## Steps

1. Add `FactoryService.readDetail` with one retry and use it in `getBoard`;
   add a mixed-failure service test and a repeated-failure test.
2. Prefix a non-default `FACTORY_URL` in `startCommand`; add config tests for
   default, custom, and quoted values.
3. Build the MCP child environment from a cross-platform allowlist plus config
   env; add a fake `debug_env` tool and a sentinel test. Add stdout/stderr
   `error` handlers mirroring stdin.
4. Refactor `useFactoryPoll` to one lifetime loop with `linearIdRef`, a queued
   flag, and a `wakeRef`; reset the ticket and wake on selection changes.
5. Remove `storage` from `BoardSnapshotSchema`, `deriveSnapshot`, and affected
   tests.
6. Validate the configured MCP script path in `loadMcpConfig` and return an
   actionable config error; add the missing-script test.
7. Update the browser QA to assert the single loop and refresh counts.
8. Run `npm run check --workspace bb-plugin-factory-bots`, root `npm run check`,
   rebuild, install, reload, and open the panel.
