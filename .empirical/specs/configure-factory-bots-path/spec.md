# Configure Factory Bots Path

## Request

> Add me the ability to change the path of the software factory.

## Goal

A BB operator can change the Factory Bots plugin's Factory checkout path from BB Settings. The saved path takes effect without editing `factory.mcp.json` or restarting BB, and the existing Factory connection continues to work when the path is valid.

## Acceptance Criteria

- [ ] [AC-1] BB Settings exposes a labeled Factory checkout path field for Factory Bots.
- [ ] [AC-2] The saved absolute checkout directory is used to launch `<path>/dist/main.js mcp`; the existing `FACTORY_URL` and other MCP configuration remain intact.
- [ ] [AC-3] A path change replaces the existing MCP connection safely, and subsequent board, ticket, and chat requests use the new connection without a BB restart.
- [ ] [AC-4] An empty path uses the plugin's bundled `factory.mcp.json` default. A nonexistent or invalid path produces a visible actionable unavailable state rather than crashing the plugin.
- [ ] [AC-5] The plugin's README explains where to set the checkout path and how to restore the default.
- [ ] [AC-TEST-1] Tests prove path resolution, default behavior, invalid path handling, and that a changed path is used by a newly created client.
- [ ] [AC-UI-1] The BB settings surface shows the path field and its description.

## Scope

Factory Bots plugin settings, MCP config resolution and connection lifecycle, related tests and plugin documentation.

## Non-goals

Factory UI or factory service changes, factory data mutation, a directory picker, changing the MCP URL, or modifying factory behavior.

## Risks

A malformed path or missing entry point can make the Factory unavailable. Keep the prior client alive until a new configuration is validated, and surface a clear error for rejected paths. Dispose the old child process after switching to avoid leaks.

## Verification

Run the Factory Bots package typecheck and tests, then the repository's configured checks. Build the plugin, install/reload it in BB, and verify the settings field is visible. Exercise a valid path switch and an invalid path through tests; do not claim a live factory connection unless the local factory actually responds.

## Capability Deltas

See `deltas/factory-bots-configurable-checkout.md`.
