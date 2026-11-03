# Factory Soul Editor — Plan

1. Scaffold `plugins/factory-souls`: package manifest, TS config, app entry,
   styles, icon, MCP config, README, and workspace catalog entry.
2. Copy the MCP stdio client and config loader patterns from the existing BB
   plugin convention. Rename the config override and client identity for this
   plugin.
3. Add `contract.ts` with bot order, soul/status/audit/save schemas, failure
   union, and four RPC definitions.
4. Implement `lib/service.ts` with an explicit four-tool allowlist, payload
   parsing, failure/start-command mapping, save attribution, and no other
   factory methods.
5. Implement pure `lib/soul.ts`: summary extraction, character delta, line
   diff, latest audit row, stored-text equality, and bot ordering.
6. Implement `lib/draft.ts`: per-bot local draft read/write/remove and the
   session author key; malformed values are ignored.
7. Build the list/detail panel in `app.tsx`: loaded/offline states, fixed order,
   summary/count/changed time, editor, warning, read-only tools with explicit
   not-reported state, author, latest audit, and draft restoration.
8. Build the first confirmation diff screen and second confirmation dialog with
   exact-name input, acknowledgment checkbox, author display, disabled Save, and
   Escape/Cancel behavior.
9. Wire the save flow: one `saveSoul` call, no retry, keep draft on failure,
   then parallel `getSouls`/`getAudit`, normalized equality, verified badge,
   stored text, and newest audit row.
10. Style the panel with BB theme variables, a responsive master/detail layout,
    visible focus, readable diff, and no horizontal overflow.
11. Add unit tests for the service boundary, payload/error handling, summary,
    diff, audit selection, draft parsing, and save reconciliation.
12. Run typecheck, tests, and build; install the plugin in BB; run browser
    verification with a temporary mock Factory MCP/API so no live soul changes.
    Capture desktop and narrow screenshots and inspect focus/disabled states.
13. Restore the real MCP config, reload the plugin, and verify the live list is
    read-only and the status tool-list gap is labelled.

## Affected tests

plugins/factory-souls/test/soul.test.ts
plugins/factory-souls/test/draft.test.ts
plugins/factory-souls/test/service.test.ts
plugins/factory-souls/test/contract.test.ts
plugins/factory-souls/test/manifest.test.ts
