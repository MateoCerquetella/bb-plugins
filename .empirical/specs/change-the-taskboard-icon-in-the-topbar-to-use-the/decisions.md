# Decisions: Change The Taskboard Icon In The Topbar To Use The

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

Taskboard is already classified as `task`; both launcher icons and fallback tab
icons render through the shared `ICON_PATHS` registry.

### Options

1. Add a Taskboard-only renderer.
2. Rename and rewire the icon kind.
3. Replace the existing `task` path data.

### Chosen approach

Replace the existing `task` path data with Taskboard's target/dart geometry.

### Trade-offs and risks

Other actions classified only by containing `task` also receive this glyph.
The current catalog uses that kind for Taskboard, and avoiding a new special
case keeps the requested change localized.

### Verification

Run focused Action Topbar tests and inspect the installed UI at its actual
topbar size.
