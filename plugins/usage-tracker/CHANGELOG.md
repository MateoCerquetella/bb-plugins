# Changelog

## 0.1.8 - 2026-09-04

- Preserve the v0.1.6 provider set (Codex, Claude Code, Cursor, Grok, and OpenCode) and add Google Antigravity quota tracking as an opt-in provider.
- Discover `agy` from PATH and supported macOS fallback locations, use the official Antigravity mark, and show all Antigravity quota groups.

All notable changes to Usage Tracker are documented here.

## Unreleased

## 0.1.6 - 2026-09-02

### Added

- Show Grok and OpenCode usage with independent settings, provider details,
  and their BB provider marks.
- Summarize larger provider sets with the highest usage and a `+N` count, with
  a click-open provider overview, and color usage yellow from 80% and red from
  95%.
- Show available Codex usage resets in expanded details with an explicit
  confirmation before any reset is consumed.

### Fixed

- Omit the five-hour row for Codex Pro accounts that do not report that
  limit, and let the weekly row use the full details-card width.

## 0.1.5 - 2026-08-31

### Fixed

- Keep the sidebar footer strip on one row at narrow widths, let compact
  progress rails yield before provider marks and readings, and keep refresh
  available from the responsive details card.
- Size and stack the details card from the live sidebar footer so its content
  remains visible when the sidebar is resized to its minimum width.

## 0.1.4 - 2026-08-28

### Changed

- Consolidated the Git patch release on the merged provider-key,
  compact-limit, additional-window, and provider-local failure behavior.

## 0.1.3 - 2026-08-27

### Added

- A Compact limit setting chooses whether the collapsed percentage and
  progress bar show weekly or five-hour usage. Weekly is the default.
  Contributed by [Stephen Dolan (@stephendolan)](https://github.com/stephendolan).

### Fixed

- Read the current BB provider keys for Claude Code and Cursor while preserving
  compatibility with legacy keys, and isolate an omitted provider instead of
  failing the complete usage snapshot.
- Show and retain every additional provider usage window after the canonical
  five-hour and weekly rows, with responsive scrolling, accessible focus, and
  reliable close, refresh, and Escape behavior.

## 0.1.2 - 2026-08-17

### Changed

- Migrated development types to the pinned `@get-bb/plugin-sdk` development
  dependency and raised the minimum BB version to 0.38.

## 0.1.1 - 2026-08-12

### Added

- Independent settings for showing or hiding Claude Code and Codex usage in
  the sidebar footer. Both providers remain enabled by default.

### Changed

- Provider visibility updates live after settings are saved, and the compact
  strip adapts its layout when only one provider is enabled.
- A single enabled provider now forms a compact right-aligned group with its
  refresh control, rather than retaining the full two-provider width.
- Disabling both providers hides the Usage Tracker sidebar row.

## 0.1.0 - 2026-08-11

### Added

- Initial release with compact Claude Code and Codex five-hour and weekly
  usage limits, expandable reset details, manual refresh, and last-known value
  retention.
