# Factory Bots Configurable Checkout Specification

## Purpose

Allow the operator to point Factory Bots at a different local Factory checkout without hand-editing its MCP JSON or restarting BB.

## Requirements

### Requirement: Configure a Factory checkout

Factory Bots MUST let an operator set an absolute Factory checkout directory through BB Settings. The plugin MUST use the selected checkout's `dist/main.js` as its MCP entry point, preserve the configured Factory URL, and reconnect without restarting BB. An empty setting MUST restore the bundled MCP config default.

#### Scenario: Switch to another checkout

- GIVEN Factory Bots is connected through the bundled config
- WHEN the operator saves another valid checkout directory
- THEN new MCP requests use that checkout's `dist/main.js`
- AND the existing client is disposed after the new connection is ready

#### Scenario: Reject an invalid checkout

- GIVEN the operator saves a path without an accessible Factory entry point
- WHEN Factory Bots applies the setting
- THEN it keeps the current usable connection
- AND reports an actionable validation error

#### Scenario: Restore the bundled default

- GIVEN a custom checkout path is saved
- WHEN the operator clears the setting
- THEN Factory Bots reconnects using the bundled `factory.mcp.json`
