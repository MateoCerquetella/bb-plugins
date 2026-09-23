# Design

Package the plugin under plugins/jev-route and register it in the monorepo catalog. Use the SDK 0.4.21 surface pinned to BB 0.40. The server reads provider-neutral turn events and optional local Jev routing logs; the frontend shows a compact badge and paginated dialog. Polling is read-only with respect to chat history. Model color overrides are isolated KV keys.

For Dyaus, run Codex Router and the MIT-licensed Jev Python runtime as independent user services on loopback. Preserve native model catalog entries, add jev/auto via structured JSON registration, and register Jev Routing in BB's managed custom model list. Keep credentials in mode-600 operator files outside Git.

The Python client's explicit user-agent avoids the observed TypeSafe 403 response. A real Codex invocation, not just health checks, verifies the route. Other providers receive model tracking; automatic routing remains the Codex Responses integration.
