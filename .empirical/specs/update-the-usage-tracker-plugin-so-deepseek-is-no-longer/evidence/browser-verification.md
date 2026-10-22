# DeepSeek sidebar verification

- Date: 2026-10-22
- Surface: live BB at `https://cerq.getbb.app` with Usage Tracker installed from
  this checkout (`path:plugins/usage-tracker`), then restored to its Git source.
- Fixture: the browser's existing last-known Usage Tracker snapshot, which
  included a DeepSeek balance of `$14.72` left from a `$20.00` topped-up
  amount. No live DeepSeek key was supplied for this pass, so the provider
  correctly reported the unauthenticated state below the cached values.

## Observed

- The sidebar summary showed `100% +5`, counting DeepSeek as the sixth enabled
  provider alongside Codex, Claude Code, Cursor, Grok, and OpenCode.
- The overview listed DeepSeek with its own brand mark and a `26.4%` reading,
  with accessible text "DeepSeek last-known topped-up balance: 26.4% used".
- Expanding DeepSeek rendered the DeepSeek mark, "Topped up used", `26.4%`,
  `$14.72 left of $20.00 topped up`, `Granted $0.00 · Topped up $14.72`, the
  progress rail, and the recovery message "Add a DeepSeek API key in Settings
  → Plugins → Usage Tracker, or set DEEPSEEK_API_KEY."
- DeepSeek did not contribute to the `100%` agent-usage summary; Codex
  remained the only in-use agent provider counted there.
- The card fit the sidebar width without horizontal overflow.

## Artifact

- `evidence/deepseek-sidebar.png`
