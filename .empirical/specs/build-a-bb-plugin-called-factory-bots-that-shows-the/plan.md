# Plan

## Affected tests

- `plugins/factory-bots/test/derive.test.ts`
- `plugins/factory-bots/test/service.test.ts`
- `plugins/factory-bots/test/mcp-client.test.ts`
- `plugins/factory-bots/test/config.test.ts`
- `plugins/factory-bots/test/route.test.ts`

## Steps

1. Scaffold `plugins/factory-bots` with the repository's package layout:
   manifest, tsconfig, icon, MCP config, README, and `check` scripts.
2. Define `contract.ts`: zod payload schemas for the five Factory tools, the
   board/ticket result unions, and the RPC contract.
3. Implement `lib/config.ts`: load and validate `factory.mcp.json`, resolve it
   from source or `dist/`, and render the start command.
4. Implement `lib/mcp-client.ts`: lazy stdio child, id-correlated JSON-RPC,
   initialize handshake, per-request timeout, exit recovery, and disposal.
5. Implement `lib/derive.ts`: agent ordering/filtering, columns, held-ticket
   counts, task matching, blocked precedence with verbatim reasons, current
   work, and stage-count labeling.
6. Implement `lib/service.ts`: parallel board reads, per-ticket detail reads,
   the `(stage, conversationId)` transcript cache, and failure classification
   into not-running vs unavailable results with the start command.
7. Wire `server.ts` to the service, register `getBoard` and `getTicket`, and
   dispose the MCP child on unload.
8. Build `app.tsx` and `app.css`: health header, ordered agent cards with status
   dots and current work, URL-owned agent and ticket drill-down, live tool
   highlighting, offline/empty/loading states, and a non-overlapping 5-second
   poll for board and selected ticket.
9. Write the five focused test files plus a scripted stdio MCP fixture.
10. Register the plugin in `.bb/plugins.json` and the root README; document
    setup, read-only guarantees, status rules, and behavior.
11. Run `npm run check`, install locally, open the panel in BB's browser,
    verify live data and the not-running message path, and capture screenshots
    of the board and a ticket detail.
