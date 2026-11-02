# Decisions: Factory Bots Follow-Up

## D-001: Retry a failed detail read once

Status: Accepted

### Evidence

- The first review found that one transient `factory_ticket` failure blanks the
  whole board and the selected ticket.
- The factory's read API is local and cheap; one retry covers a momentary lock
  or restart without hiding a persistent failure.

### Options

1. Fail the board on the first detail failure.
2. Retry once, then fail the board.
3. Ignore the failure and show a possibly stale board.

### Chosen approach

Choose option 2. A second failure still returns the not-running/unavailable
state, so a blocked reason is never silently cleared.

### Trade-offs and risks

One extra read per failed ticket in a bad cycle. Persistent failures stay
visible; transient failures recover.

### Verification

Stub caller fails the first read and succeeds the second; a second test fails
both and expects the board failure.

## D-002: Show a non-default FACTORY_URL in the start command

Status: Accepted

### Evidence

- The start command is derived from the same config as the MCP call so the two
  cannot drift.
- `FACTORY_URL` selects which factory the plugin reads.

### Options

1. Print the whole config env (risks leaking secrets).
2. Print only `FACTORY_URL`, and only when it differs from the default.
3. Never print env.

### Chosen approach

Choose option 2 with shell quoting.

### Trade-offs and risks

A custom URL makes the command longer; the default stays clean. Other env keys
are never exposed.

### Verification

Config tests assert the prefixed and unprefixed forms.

## D-003: Minimal MCP child environment

Status: Accepted

### Evidence

- The child is a read-only HTTP proxy; it needs runtime paths and locale, not
  BB's provider credentials.
- The config's own env (notably `FACTORY_URL`) must still pass through.

### Options

1. Inherit `process.env` and trust the child.
2. Use a small cross-platform allowlist plus config env.

### Chosen approach

Choose option 2: `PATH`, `HOME`, temp dirs, locale, timezone, user/shell, and
Windows equivalents, then `config.env`.

### Trade-offs and risks

A future MCP server needing another variable must add it to the allowlist. The
fake server exposes an env sentinel so regressions are visible.

### Verification

MCP client test with a sentinel parent variable asserts it is absent.

## D-004: One lifetime poll loop with a wake signal

Status: Accepted

### Evidence

- Restarting the effect on every route change can overlap the previous board
  read.
- The panel still needs an immediate ticket fetch when the selection changes.

### Options

1. Keep per-route effects and accept the overlap.
2. Run one lifetime loop, read the selection from a ref, and wake it on change.

### Chosen approach

Choose option 2. A queued flag prevents a second cycle while one is in flight;
the wake path clears the timer and runs immediately.

### Trade-offs and risks

The loop is slightly more stateful. The queued flag keeps the no-overlap
guarantee while making route changes responsive.

### Verification

Browser QA asserts two board reads over 5.5s and two ticket reads on a ticket
route; the TicketPane rejects stale selection data.

## D-005: Remove the storage path from the board snapshot

Status: Accepted

### Evidence

- Nothing renders `snapshot.storage`.
- AC-7 says the plugin exposes no database path.

### Options

1. Keep the field for future diagnostics.
2. Remove it from the RPC snapshot.

### Chosen approach

Drop it from the contract and derivation. The raw payload may still contain it;
the plugin does not surface it.

### Trade-offs and risks

A future diagnostics view would re-add it deliberately.

### Verification

Typecheck and focused derivation tests.

## D-006: Report a missing MCP script as configuration

Status: Accepted

### Evidence

- A host-specific path is expected in this checkout.
- Another install that does not edit the config should get a fixable message,
  not a generic unavailable wall.

### Options

1. Replace the supplied path with a template.
2. Keep the supplied path and validate it at load, naming the override.

### Chosen approach

Choose option 2. The operator-supplied command stays; a missing script returns
an actionable config error.

### Trade-offs and risks

Node itself missing remains a spawn error. The message names the exact file.

### Verification

Config test with a nonexistent script path.
