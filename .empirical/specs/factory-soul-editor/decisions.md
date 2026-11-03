# Decisions: Factory Soul Editor

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Build a separate Factory Souls plugin

Status: Accepted

### Evidence

The existing Factory Bots plugin is explicitly an observer with a read-only
board and a separate chat write path. Its backend says it never writes, and the
soul editor has stricter boundaries: only four MCP tools, no tickets, no board,
no storage, and a two-step confirmed write. Keeping the editor in a separate
plugin makes those boundaries literal and independently installable.

### Options

1. Add a Souls tab to the existing Factory Bots plugin.
2. Build a new `factory-souls` plugin with its own MCP client and server.

### Chosen approach

Build `plugins/factory-souls` as a new plugin. It copies the small MCP stdio
client and config loader patterns but has a service whose allowed-tool set is
exactly `factory_status`, `factory_souls`, `factory_soul_set`, and
`factory_soul_audit`. Its app is a focused master/detail panel.

### Trade-offs and risks

The new plugin duplicates the MCP client and config loader. That is deliberate:
plugins remain independent and the old observer cannot accidentally gain soul
writes. The status payload currently has no per-bot tool list; the UI will show
an explicit not-reported state rather than inventing authority. Extending the
factory status is a separate, read-only change.

### Verification

The new plugin has its own typecheck, tests, build, and installed panel. Tests
assert the allowed-tool boundary and the save/re-read flow; browser evidence
covers the list, editor, diff, and second confirmation.

## D-002: Treat a missing status tool list as a visible data gap

Status: Accepted

### Evidence

The live `factory_status` response contains `bots` as bot-to-conversation-id
numbers, plus ticket and stage counts. It has no per-bot tools field. The soul
is prose; the authority matrix lives in factory code and is not returned by the
four permitted tools.

### Options

1. Duplicate a tool list in the panel from source code or a constant.
2. Show an explicit "not reported by factory_status" state until the field is
   exposed by the factory.

### Chosen approach

Support optional `toolsByBot` and `tools` fields when the status payload
provides them. If neither exists, label the list as not reported and keep the
read-only note. Never infer authority from the soul.

### Trade-offs and risks

The panel will show a gap on the current factory build. That is safer than
claiming an authority list that may be stale or wrong. A follow-up can add a
read-only `toolsByBot` field to `factory_status` and its tests.

### Verification

The status schema accepts the optional map; the detail view has a distinct
not-reported state; no authority constant exists in the plugin.
