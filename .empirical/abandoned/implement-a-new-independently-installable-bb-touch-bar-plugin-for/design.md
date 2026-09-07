# Design: BB Touch Bar Agent Monitor

## Components

### BB plugin backend

`plugins/touchbar/server.ts` registers declarative settings and one `bb
touchbar` CLI command. It uses public `bb.sdk.threads` operations only. The
backend queries a bounded page of non-archived threads, projects them through
pure functions in `lib/snapshot.ts`, and serializes one stable JSON envelope.

Supported commands:

- `snapshot` returns the bounded JSON envelope for machines and BTT.
- `open <thread-id>` resolves the thread, rejects archived/unknown ids, then
  delegates opening to BB.
- `stop <thread-id>` resolves the thread, permits only active work, and then
  stops exactly that id.
- `help` and malformed input return concise usage without stack traces.

The projection strips message content, paths, prompts, and provider output.
Titles/project labels are normalized, single-line, and truncated. Ordering is
status priority, unread attention, newest update, then id. Settings clamp the
card count and hide hidden workers by default.

### BetterTouchTool Swift source companion

`companion/BBTouchBar.swift` is a BTT Swift Source Plugin conforming to
`BTTPluginInterface`. BTT compiles it locally with its supplied bridging header.
The plugin returns one persistent `NSViewController` containing:

- an aggregate status button;
- up to three compact thread buttons inside a horizontal stack;
- a disconnected/empty state using the same bounded footprint.

A non-overlapping timer launches the BB CLI off the main thread every two
seconds. The process is invoked directly with an argument array, never a shell,
and is force-terminated after a short timeout. Decoded JSON is validated before
the main-thread view update. Buttons carry exact thread ids as represented
objects and invoke only `bb touchbar open <id>`. A refresh failure retains no
sensitive diagnostic text and shows `BB offline`.

BB executable lookup checks an installer-injected absolute path, the current
process PATH, and common Intel/Homebrew locations. `companion/install.sh`
resolves the current `bb`, writes a user-scoped generated source copy into the
BTT Plugins directory, and never edits BTT databases or enables a preset. The
user approves BTT compilation and adds the widget to All Apps in BTT.

## Interfaces and data

The JSON envelope is versioned:

```json
{
  "schemaVersion": 1,
  "generatedAtMs": 0,
  "summary": { "active": 0, "attention": 0, "visible": 0 },
  "threads": [
    {
      "id": "thr_…",
      "title": "Fix tests",
      "status": "active",
      "providerId": "codex",
      "project": "bb-plugins",
      "updatedAtMs": 0,
      "unread": false,
      "attention": null
    }
  ]
}
```

The companion treats unknown schema versions, missing fields, oversized
responses, nonzero exit, decode failure, and timeout as offline. Thread ids are
never parsed or composed by the companion.

## Failure and lifecycle behavior

- BB unavailable: BTT shows `BB offline`; polling stays serialized.
- No visible threads: BTT shows `BB idle`.
- CLI output exceeds the companion bound: discard it.
- BTT view disappears: invalidate the timer; reappearance restarts it.
- Open process fails: leave UI responsive and request an immediate refresh.
- Settings contain invalid text: backend applies documented defaults/clamps.
- Plugin disable/uninstall removes the CLI; companion degrades to offline.

## Verification design

- Pure Node tests cover projection, sort, truncation, filtering and settings.
- Official BB testing harness covers CLI registration, JSON schema shape,
  unknown commands, guarded stop/open behavior, and SDK call attribution.
- A companion contract test validates source metadata, safe Process invocation,
  timeout/offline paths, installer syntax, and JSON fixtures on non-macOS CI.
- Package build verifies the managed install artifact includes server, assets,
  companion, license and README but no generated output.
- Local BB install/reload and CLI smoke tests exercise the live boundary.

## Distribution

The leaf package targets BB 0.40 and exact SDK 0.4.21, stays independently
installable under `plugins/touchbar`, and is indexed by `.bb/plugins.json`, the
root workspace, and README. BetterTouchTool remains a separately installed
third-party dependency and no BTT code is vendored.
