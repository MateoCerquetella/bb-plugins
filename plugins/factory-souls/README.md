# Factory Souls

Read and deliberately edit the prose each [Empirical
Factory](https://github.com/GoEmpirical/empirical-factory) bot is told.

Factory Souls is a standalone BB plugin. It lists the Factory bots in their
fixed order with each seed-grown Dood, shows each soul beside its live Dood in
a monospace editor, and can replace one soul through the Factory MCP. A change
needs a diff review first, then a second dialog where you type the bot name
exactly and acknowledge that its next turn uses the new text. The person making
the change is recorded as the author.

## Install

```sh
bb plugin install ./plugins/factory-souls
bb plugin reload factory-souls
```

The plugin reads `factory.mcp.json` beside the installed manifest. By default it
runs:

```json
{
  "command": "node",
  "args": ["/home/dyaus/Developer/projects/GoEmpirical/empirical-factory/dist/main.js", "mcp"],
  "env": { "FACTORY_URL": "http://127.0.0.1:8080" }
}
```

Edit that file when the factory checkout moves, or add `FACTORY_TOKEN` only if
the factory was started with a write token. `FACTORY_SOULS_MCP_CONFIG` can point
at another config file.

## What it reads and writes

This panel can reach only four Factory MCP tools:

- `factory_souls`
- `factory_soul_set`
- `factory_soul_audit`
- `factory_status`

It never calls ticket, transcript, task, board, or message tools, and it does
not open factory storage. The server has a single allowed-tool set; the app has
no generic tool RPC.

`factory_soul_set` requires a non-empty author. The author is entered once per
browser session, remembered in `sessionStorage`, shown in the final dialog, and
sent with the full replacement text.

## Safety flow

1. Edit a soul. The editor shows the current and edited character counts and a
   warning that the next turn uses this text while code, tools, and permissions
   stay separate.
2. **Review & save** opens a current-versus-edited diff with the exact character
   delta. **Continue** sends nothing.
3. The second dialog names the bot, requires typing the bot name exactly, and
   requires **I understand the next turn uses this text**. Save is disabled
   until both hold and the author is present.
4. After a successful write, the panel re-reads `factory_souls` and
   `factory_soul_audit`. It shows the freshly stored text with **Verified saved**
   only when the read-back matches, and shows the newest audit row with author,
   time, and digest. If a re-read fails, it does not claim verification.

Drafts are local to the browser, stored per bot, labelled **Unsaved**, and
restored across navigation or reload. They clear only after a verified save or
an explicit discard.

## Tool list

The detail view shows a **read-only** tool list from `factory_status` when the
status payload reports one. The current factory status returns no per-bot tools;
the panel says **Not reported by factory_status** rather than inferring or
duplicating the authority matrix. A future status field can add the list without
changing the panel's write contract.

## Offline state

When the Factory MCP cannot reach the factory, the panel shows **Factory is not
running**, the derived start command, and a retry button. It keeps any draft.

## Development

```sh
npm run check --workspace=bb-plugin-factory-souls
```

The tests cover the allowed-tool boundary, payload and failure mapping, summary
and diff math, draft parsing, author attribution, and save reconciliation.
