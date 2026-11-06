# Plan: Configure Factory Bots Path

1. Add `factoryCheckoutPath` to BB plugin settings and a pure config helper that derives `<checkout>/dist/main.js`, preserving args and environment. Test default, normalized custom paths, and missing entry points.
2. Refactor Factory Bots server initialization into one active runtime containing its MCP client and three service wrappers. On settings changes, validate a candidate, switch runtime atomically, then dispose the previous client; invalid values retain the active runtime and expose an error.
3. Add a Factory Bots plugin settings section showing the effective checkout and path errors. Update the README with the field, expected layout, and reset behavior.
4. Run the Factory Bots typecheck and tests, repository `npm run check`, build and reload the local plugin, and verify the setting is present in BB Settings.

## Affected tests

- plugins/factory-bots/test/config.test.ts
- plugins/factory-bots/test/server.test.ts
