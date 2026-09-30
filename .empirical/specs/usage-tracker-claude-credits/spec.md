# Usage Tracker Claude Credits

## Request

> Implement GitHub issue #43: show Claude Code usage credits (the dollar amount reported by Claude Code /usage) in Usage Tracker, with accessible UI, focused tests, documentation, issue closure, and a new immutable Usage Tracker patch release that the marketplace range resolves.

## Goal

Show the USD credit usage and limit reported by BB for Claude Code in the
expanded Usage Tracker details, alongside the existing percentage/reset data,
then publish the compatible change as Usage Tracker v0.1.9.

## Acceptance Criteria

- [ ] [AC-1] A Claude Code usage window with cost data shows a localized
  `$used of $limit` credit line in its expanded detail row.
- [ ] [AC-2] Windows without cost data keep the existing reset-only layout and
  never display invented credit values.
- [ ] [AC-3] The credit line is ordinary readable text included in the detail
  dialog's accessible content and does not add a control or focus stop.
- [ ] [AC-4] Existing BB/current and legacy provider normalization, cached
  windows, percentages, reset times, and other providers remain unchanged.
- [ ] [AC-5] Focused typecheck, tests, build, and whitespace checks pass.
- [ ] [AC-6] Usage Tracker v0.1.9 is tagged and released from reviewed `main`,
  closes issue #43, and the live marketplace `^0.1.0` range resolves it.

## Scope

- Render already-normalized `UsageWindow.cost` values in expanded detail rows.
- Add focused presentation/source-contract tests and user documentation.
- Bump, publish, and verify Usage Tracker v0.1.9.

## Non-goals

- Running the Claude CLI or parsing `/usage` output inside the plugin.
- Synthesizing costs when BB omits them.
- Showing cost in the compact sidebar strip.
- Changing provider authentication or reset behavior.

## Verification

- Unit-test localized cost rendering and no-cost fallback.
- Run Usage Tracker focused typecheck, tests, build, and `git diff --check`.
- Verify the immutable tag, GitHub release, issue closure, and marketplace range.

## Capability Deltas

- `deltas/usage-tracker-provider-usage.md`
