# Design

## Architecture

The host installation lives outside the repository under
`~/.local/share/steel-browser/` and is managed by Docker Compose. The compose
file uses the upstream combined Steel image pinned by digest, maps
`127.0.0.1:3100:3000` and `127.0.0.1:9223:9223`, mounts named volumes for logs
and exports, and uses `restart: unless-stopped`. A small systemd user service
owns `docker compose up -d` and is idempotent.

The plugin lives under `plugins/steel-browser` and has four layers:

1. `steel-client.ts` validates the configured HTTP(S) base URL, applies a
   bounded timeout, and maps only Steel health/session routes.
2. `contract.ts` defines strict Zod input/output contracts for status, sessions,
   create, and release.
3. `server.ts` registers settings, RPC handlers, and CLI handlers. CLI output
   uses JSON for lifecycle commands and concise human text for status errors.
4. `app.tsx` renders the approved status-first page with loading, empty, error,
   session creation, and exact-session release confirmation states.

The plugin's bundled skill is documentation-only guidance for agents. It points
to the local endpoint and supported CLI; it does not expose credentials or
arbitrary shell commands.

## Data Flow

BB app/CLI -> plugin RPC or CLI handler -> validated Steel client -> Steel API
on loopback -> normalized response -> BB. No generic proxy route is registered.

## Failure Handling

- Invalid endpoint settings are rejected before a request.
- Requests abort at 8 seconds and return a stable unavailable message.
- Steel response JSON is parsed through strict schemas; unknown or malformed
  responses become a non-sensitive error.
- Release always requires the exact session id and the app confirms before
  calling it.

## Verification Design

Client and contract tests use a local HTTP fixture. Host verification uses
Docker inspect, curl, and a real Steel session lifecycle. Plugin verification
uses SDK types, TypeScript, build output inspection, local install/reload, CLI
smoke checks, and browser screenshots at desktop/mobile widths.
