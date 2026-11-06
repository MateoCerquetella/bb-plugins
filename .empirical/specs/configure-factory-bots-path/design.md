# Design: configurable Factory checkout

## User outcome

The operator can edit a single BB plugin setting, `factoryCheckout`, with an absolute checkout directory. Empty means the existing bundled `factory.mcp.json` default. A non-empty value points the MCP process at `<checkout>/dist/main.js`, with the existing `mcp` argument and configured environment retained.

## Data and ownership

- BB's plugin settings API owns persistence and renders the string setting in BB Settings.
- `lib/config.ts` owns path normalization, entry-point existence validation, and producing the effective MCP config.
- `server.ts` owns the active Factory connection and atomically swaps it after a new config validates. RPC handlers always read from the active runtime.
- The plugin app's settings section shows the configured path, effective path, and any rejected-path message. It does not duplicate BB's settings editor.

## Runtime transition

1. At plugin startup, load the bundled MCP config and the saved checkout setting.
2. Build and validate the candidate config. A custom path replaces the Factory entry-point argument while keeping other args and environment values intact.
3. If validation succeeds, create a candidate MCP client and new service wrappers, publish the candidate as the active runtime, then dispose the previous client.
4. If validation fails on startup, start in the existing unavailable state with a clear error. If validation fails after a settings change, retain the previous active runtime and publish the error in settings status; a later valid setting retries the transition.
5. Clearing the setting restores the bundled config through the same swap sequence.

## UI

Use the plugin's existing BB Settings form convention: a labeled text setting named “Factory checkout path”, an empty default, and help text stating that it expects an absolute checkout directory containing `dist/main.js`; empty restores the bundled default. The plugin's Settings section reports the effective connection path and last path validation error. No browser redesign or directory picker is needed.

## Boundaries

- Never interpret the path as shell text; pass it only as a string argument to Node.
- Preserve `FACTORY_URL` and any extra config args.
- Validate that the constructed entry point exists before swapping runtime state.
- Dispose the prior client only after accepting a valid candidate so a typo cannot disconnect a working factory.
- Do not alter `factory.mcp.json` on disk.

## Verification

Pure tests cover empty/default, normalized custom path, preservation of URL and trailing MCP args, and missing entry-point rejection. Server lifecycle tests use a fake client factory to prove old-runtime retention on invalid input and old-client disposal after a valid swap. BB plugin tests/build cover the settings descriptors and app section. Install/reload in BB and confirm the settings field is rendered; report a live connection only if the configured factory responds.
