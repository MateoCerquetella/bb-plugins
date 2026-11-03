# Factory Soul Editor

## Request

> Build a dedicated Factory Souls BB panel that lists every Empirical Factory bot's soul, opens one in an editable monospace view, shows the bot's read-only tool list from factory_status, and saves only after a diff confirmation and a typed bot-name plus acknowledgment confirmation with an author. Use the Factory MCP stdio tools factory_souls, factory_soul_set (requires author), factory_soul_audit, and factory_status only; never factory_ticket, factory_message, board, ticket, message, or storage access. After save, re-read souls and audit and show the newest audit row. Keep a local unsaved draft across navigation, label it unsaved, and handle Factory not running with the start command.

## Goal

Ship an independently installable `factory-souls` BB plugin that reads the seven
Factory bot souls through the Factory MCP, shows each soul in a safe editor, and
writes a replacement only after both confirmations. The panel never exposes the
Factory's tickets, chat, board, database, code, or authority matrix.

## Acceptance Criteria

- [ ] [AC-1] `plugins/factory-souls` is an independently installable BB plugin
  with its own manifest, app, CSS, server, contract, tests, README, icon, and
  workspace catalog entry.
- [ ] [AC-2] The server connects to the Factory MCP over stdio and exposes only
  `factory_status`, `factory_souls`, `factory_soul_set`, and `factory_soul_audit`
  through its service. It has no RPC or code path that calls
  `factory_ticket`, `factory_message`, `factory_tickets`, `factory_tasks`, or
  opens factory storage.
- [ ] [AC-UI-1] [UI] The list screen shows one row per bot returned by
  `factory_souls`, in the order orchestrator, sieve, helm, lens, warden, audit,
  lookback. Each row shows the bot name, the first non-heading soul line as a
  one-line summary, the soul character count, and the latest audit time when
  available. No bot is invented when the MCP omits it.
- [ ] [AC-UI-2] [UI] Clicking a row opens the full soul in a monospace editor.
  The screen shows the warning that the next turn uses this text and that code,
  tools, and permissions are unchanged, plus a read-only tool list sourced from
  `factory_status` when reported.
- [ ] [AC-UI-3] [UI] When `factory_status` does not report a per-bot tool list,
  the panel says so explicitly and does not infer or duplicate the authority
  matrix. The list is always labelled read-only.
- [ ] [AC-4] The first Save confirmation shows a current-versus-edited diff and
  the exact character delta. Continue sends nothing.
- [ ] [AC-5] The second Save confirmation names the bot, requires typing the bot
  name exactly, requires the acknowledgment checkbox, shows the saved author,
  and only then enables the final Save button.
- [ ] [AC-6] An author is requested once, remembered for the browser session,
  shown in the confirmation, and never sent empty.
- [ ] [AC-7] Save is disabled when the editor is unchanged, the soul is empty,
  the author is empty, or either confirmation is incomplete.
- [ ] [AC-8] After a successful `factory_soul_set`, the panel re-reads
  `factory_souls` and `factory_soul_audit`. It shows the freshly stored text
  with a verified-saved badge only when the re-read text matches, and shows the
  newest audit row with author, time, and digest as proof. A failed re-read is
  reported without claiming verification.
- [ ] [AC-9] Drafts survive navigation and reload for each bot in local storage,
  are visibly labelled unsaved, and are cleared only after verified save or an
  explicit discard.
- [ ] [AC-10] A Factory that cannot be reached produces a normal "Factory is not
  running" state with the derived start command and a retry action, not an error
  wall. Other failures show the exact MCP error and keep the draft.
- [ ] [AC-UI-4] [UI] The panel is usable at desktop and narrow widths, uses
  labelled semantic controls, visible focus states, and BB theme tokens.
- [ ] [AC-11] Typecheck, focused unit tests, and build pass. Tests cover the
  allowed-tool boundary, list summary and diff math, save attribution, failure
  mapping, and the post-save re-read contract.

## Scope

Build a new, standalone BB plugin. It reads souls and status through the
Factory MCP, presents the list/detail states, stores only local UI drafts and
the session author, requires the two save confirmations, and verifies a write by
re-reading souls and audit. The only remote write is `factory_soul_set` with a
non-empty author.

## Non-goals

No changes to the Factory code, authority matrix, tickets, Linear, board, chat,
or factory storage. No rich-text editor, collaborative editing, partial soul
updates, automatic retries, or automatic saves. No invented tools or bots when
the MCP does not report them. No change to the existing read-only Factory Bots
plugin.

## Verification

Run the plugin typecheck, focused tests, and build from the workspace. Exercise
the panel in BB against a mock Factory MCP that supports the four allowed tools,
including a save and its souls/audit re-read, and capture desktop and narrow
screenshots. Read the live factory only to confirm the list and the current
status-tool omission; do not change a live soul during verification.

## Capability Deltas

`deltas/factory-soul-editor.md` describes the new plugin capability. It covers
the dedicated panel, the read-only list and editor, the two-step confirmed save
with author attribution, draft continuity, the offline state, and the post-save
re-read and audit proof.
