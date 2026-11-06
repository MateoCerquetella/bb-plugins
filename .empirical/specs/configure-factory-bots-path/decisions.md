# Decisions: Configure Factory Bots Path

Record concise, externally reviewable choices for the implementation.

## D-001: Persist the checkout path in BB plugin settings

Status: Accepted

### Evidence

- `BbPluginApi.settings.define` persists typed settings and exposes `onChange`.
- `plugins/steel-browser/server.ts` uses this API and registers a plugin settings section.
- Factory Bots currently reads a bundled MCP config at startup and constructs its MCP client and services from it.

### Options

- Continue requiring manual edits to `factory.mcp.json`.
- Persist a path in a new plugin-owned database table.
- Add one string setting through the BB plugin settings API.

### Chosen approach

Use one BB setting named `factoryCheckoutPath`. Empty means use the bundled config. A non-empty absolute checkout path overrides the Factory script path with `<checkout>/dist/main.js` while preserving the remaining config arguments and environment.

### Trade-offs and risks

BB settings accept strings without custom path validation. Validate the resulting entry point before activating the new client and expose any rejected path in the Factory Bots settings section.

### Verification

Test default and custom config resolution, path validation, and client handover. Verify the BB settings field is rendered after plugin reload.

## D-002: Validate before swapping MCP runtime

Status: Accepted

### Evidence

- `FactoryMcpClient` owns the child process and exposes `dispose()`.
- Each service wrapper receives a caller at construction, so replacing only the client would leave services bound to the old runtime.

### Options

- Require a plugin reload after path edits.
- Dispose the current client before validating a new path.
- Build a candidate runtime, validate its entry point, then swap the runtime and dispose the old client.

### Chosen approach

Treat the active client and service wrappers as one runtime value. Keep the working runtime on invalid changes; publish a path error for settings. On a valid change, atomically replace the active runtime, then dispose the old client.

### Trade-offs and risks

The server has one mutable active-runtime reference plus path-error state. A focused lifecycle test must prove that invalid input does not disconnect the working client and successful input disposes the old client exactly once.

### Verification

Use an injected fake runtime factory to assert old-runtime retention and disposal order for invalid, valid, and reset-to-default changes.
