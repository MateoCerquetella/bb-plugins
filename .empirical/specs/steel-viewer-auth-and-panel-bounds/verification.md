# Verification record

## Completed checks

- Full workspace `npm run check`, invoked from the root with Node 22: exit 0 on 2026-10-30. This run precedes the subsequent relay queue hardening; the focused relay checks must be repeated for that change.
- Steel Browser SDK pin check, TypeScript, 66 unit tests and build: passed before queue hardening.
- Panel browser regression: all five variants passed at 100% and 125% zoom, desktop/touch and both themes. The fixture places composer and splitter chrome above an isolated pane, and hit testing reaches the expanded viewer. Tests retain iframe identity, load count and field value, check hover/pin/leave/shrink/thread changes, and check the clipboard dialog's Escape handling.
- Human-control browser regression: 1280 and 390 input-mode variants passed. Covers masked paste and clearing, clipboard fallback, spoof/unsolicited write rejection, account labels and viewer ownership. The shared Steel viewer may resize pages, so input-mode fixtures explicitly retain the intended pointer mode.
- Real installed relay: embedded screen frames, mouse, keyboard, masked paste and copy passed. The actual BB HTTP and WebSocket routes reject foreign Origins with HTTP 403. The same-origin player is returned without a separate Connect OAuth redirect.
- Native BB user verification: the user confirmed that the viewer works, and subsequently confirmed that composer/divider overlap is gone after the top-layer fix.

## Auth boundary

The pinned Plugin SDK documents `auth: "local"` as an Origin/Host check against BB app origins; WebSocket routes use identical authentication. The regression uses the real installed BB routes rather than pretending the fake host enforces that boundary. Player/cast targets are resolved from the saved project binding; tests confirm no forwarded cookies or authorization headers.

## Resource limits and limitations

Input is limited per message, by pending bytes and pending message count, with empty messages discarded and active upstream buffering capped. Establishment is bounded to ten seconds. The public downstream SDK exposes send, close and readyState, but no bufferedAmount or drain event; downstream screen-frame backpressure remains a host API limitation rather than an asserted bound. No profile or engine policy changes are made.

## Final repair verification

Focused SDK pin, TypeScript, 68 unit tests and build passed after queue hardening and toolbar consolidation. All five panel variants passed with one expansion owner, one reconnect owner, Copy/Paste retained and the reconnect loading the viewer exactly once. The full-toolbar human-control checks passed again at both input-mode sizes. The independent final review and upstream PR remain pending the completion workflow.
