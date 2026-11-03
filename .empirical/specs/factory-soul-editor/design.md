# Factory Soul Editor — Design

## Shape

A new, independently installable plugin at `plugins/factory-souls`:

- `server.ts` owns one Factory MCP stdio child via the copied config/client.
- `lib/service.ts` is the only factory reader/writer and accepts exactly four
  tool names.
- `contract.ts` defines four RPCs and their result unions.
- `app.tsx` is a master/detail panel: bot list, soul editor, diff review, and
  second confirmation.
- `lib/soul.ts` holds pure summary, diff, audit, and stored-text helpers.
- `lib/draft.ts` owns local draft and session-author persistence.
- `app.css` uses BB theme variables and a compact, native panel layout.

The plugin is separate from the read-only Factory Bots observer. Its nav panel
is titled **Factory Souls** and has no ticket, board, transcript, or chat
surface.

## Data boundary

The service has one allowed set:

```text
factory_status
factory_souls
factory_soul_set
factory_soul_audit
```

Every tool read/write goes through `readTool` / `writeTool`, which reject any
other name before touching the MCP client. There is no generic RPC that accepts
a tool name. The app has no import of factory storage and no HTTP client.

The factory's MCP config is `factory.mcp.json` using the documented command and
`FACTORY_URL`. `FACTORY_TOKEN` is omitted by default and may be added by the
host only when the factory was started with one. The config loader reports a
missing script or malformed config without inventing a connection.

## Payloads and RPCs

- `factory_souls` → `{ souls: [{ bot, soul }] }`.
- `factory_status` → status shape plus optional `toolsByBot`/`tools` maps. A
  per-bot array is the only accepted tool authority. If absent, tools = null.
- `factory_soul_audit` → `{ entries: [{ at, bot, author, digest,
  charactersBefore?, charactersAfter? }] }`.
- `factory_soul_set` → `{ bot, saved, author, digest }`.

RPCs:

- `getSouls` → `{ ok, fetchedAt, souls }` or failure.
- `getStatus` → `{ ok, fetchedAt, toolsByBot }` or failure.
- `getAudit` → `{ ok, fetchedAt, entries }` or failure.
- `saveSoul(bot, soul, author)` → `{ ok, fetchedAt, bot, digest }` or failure.

The server validates every payload with Zod; shape errors are explicit. A fetch
failure maps to `not-running` and carries the derived start command. Every other
failure keeps the exact trimmed MCP error. No RPC retries.

## List and detail state

One app component owns:

- `souls`, `status`, `audit`, `loading`, `loadError`.
- `selectedBot: BotName | null`.
- `editor: string`, `original: string`, `draftRestored: boolean`.
- `author` from `sessionStorage`.
- `confirmStage: "none" | "diff" | "final"`.
- `typedBot`, `acknowledged`, `saving`, `saveError`, `saveNotice`.

The list is rendered in the fixed order. Rows are buttons with accessible names.
Summary = first non-empty non-heading line, stripped of leading markdown list
markers and emphasis, bounded for one line. Character count is `soul.length`.
Changed time = latest audit `at` for that bot, formatted locally, absent if none.
A row with a draft different from the current soul shows an **Unsaved** badge.

Selecting a row sets `editor` from a valid draft or the stored soul. The detail
shows:

- warning banner: next turn text; code/tools/permissions unchanged;
- monospace editor with char count and unsaved badge;
- read-only tools aside, with a distinct "not reported" state;
- author field (session-scoped);
- latest audit row;
- Review button and a discard-draft action when applicable.

The author is requested once with a labelled input. It is stored in
`sessionStorage` under `factory-souls:author:v1`; never in the remote write if
empty.

## Draft model

Per bot key: `factory-souls:draft:v1:<bot>` containing:

```json
{ "text": "...", "base": "stored soul at draft start", "updatedAt": 0 }
```

On edit, write the draft. On open, restore it only when it differs from the
stored soul; show a restored-draft banner. If the stored soul changed while a
draft existed, keep the draft, label it unsaved, and show that the base moved.
Clear only after verified save or explicit discard. A malformed draft is
ignored and removed. Draft storage is local UI state, never factory truth.

## Diff review

Pure `diffLines(before, after)` builds an LCS line diff for display:
`same`, `add`, `remove` rows with line labels. Character delta is
`after.length - before.length`, displayed exactly with a sign. The first review
screen shows current and edited panes/rows, the delta, and Continue/Cancel. The
Continue action only changes local state; it never calls the RPC.

## Final confirmation and save

The second dialog:

- names the bot and destination;
- repeats the next-turn warning;
- shows the author;
- requires `typedBot === bot`;
- requires an acknowledgment checkbox with exact wording;
- disables Save until both hold and `author.trim() !== ""`;
- has one Save action and no automatic retry.

`saveSoul` is called once. On failure, the dialog remains, the exact error is
shown, and the draft is untouched. On success:

1. call `getSouls` and `getAudit` (parallel);
2. find the bot in the fresh souls;
3. compare stored text to edited text, tolerating the factory's single trailing
   newline normalization;
4. if equal and read succeeded, show **Verified saved**, display stored text,
   update original, clear the draft, and show the newest audit row;
5. if the write succeeded but a read failed or text differs, show the failure
   or mismatch state without the verified badge, keep the draft, and show the
   write receipt/error context.

The latest audit row is selected by bot and newest `at`, showing author, time,
and digest. The digest is display text, not a secret.

## Offline and error behavior

- `getSouls` failure with `not-running` renders a centered offline state:
  Factory is not running, the derived start command in a code block, and Retry.
- Config errors show the config message and the same retry.
- A status failure alone leaves the soul list usable and shows a read-only
  status warning; audit failure leaves the list/editor usable and labels the
  audit unavailable.
- Save failure shows the exact error and keeps the draft.

## Responsive and accessibility

Desktop is a two-column master/detail with the list at ~300px and the editor
flexing. Below ~900px the list and detail become sequential; selecting a bot
switches to the detail with a Back control. The panel avoids horizontal page
overflow; the editor can scroll vertically and is resizable.

Buttons are real buttons, labels are associated, the editor has a label,
diff rows use text as well as color, focus-visible rings use BB tokens, and the
confirmation has `role="dialog"`, `aria-modal`, a heading, Escape-to-cancel, and
initial focus on the typed-name input.

## Testing and verification

Unit tests use a fake tool caller to prove:

- only the four permitted tools are ever requested;
- soul/status/audit payload parsing;
- author is included and empty authors are rejected;
- not-running mapping and start command;
- save success, failure, and post-save re-read reconciliation;
- summary, char delta, diff rows, newest audit, and trailing-newline equality.

Browser verification uses a temporary mock Factory MCP/API so the save path can
run without changing a live soul. It exercises list, tool-list gap, editor,
draft restore, diff, incomplete/correct confirmation, save, re-read, audit
proof, and narrow layout. The live factory is only read for the list and the
known status gap.

## Risks

- The current `factory_status` has no tool map; the panel shows a not-reported
  state. A future factory change can add `toolsByBot` without changing the
  plugin contract.
- A factory that appends a newline will make raw text differ by one character;
  verification compares normalized trailing whitespace and displays the stored
  count.
- Local drafts are per browser profile, not shared; the panel labels this.
- A save can succeed while the follow-up read fails; the UI reports success of
  the write only through the MCP response and withholds the verified badge.
