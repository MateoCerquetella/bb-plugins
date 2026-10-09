# Fix The Dockside Thread Row Icon Problem Shown In The

## Request

> Fix the Dockside thread-row icon problem shown in the supplied screenshot: provider icons and adjacent project/letter marks visually overlap in the leading icon area. Preserve the existing compact layout and project badges, make the thread icon slot render cleanly at supported densities, add focused regression coverage, and verify the Dockside UI in a browser with a screenshot.

## Goal

Render each grouped Dockside root with one clean project badge in the leading
slot and one compact provider identity beside its trailing status, eliminating
the duplicate provider mark that overlaps the project letter while retaining
the two-row thread layout.

## Acceptance Criteria

- [ ] [AC-1] Every grouped non-selection root thread row reserves exactly one
  fixed leading icon slot for its project badge.
- [ ] [AC-2] The root provider glyph appears exactly once in trailing metadata,
  immediately before the family status icon, and never overlaps the leading
  project letter, title, or neighboring content.
- [ ] [AC-3] Project header and grouped-root badges share the configured project
  color and initial.
- [ ] [AC-4] Selection mode continues to replace the leading project badge with
  its checkbox and omits the provider glyph without changing the two-row
  root-card layout.
- [ ] [AC-5] Focused automated coverage guards the leading project-badge
  placement and the single trailing provider slot.
- [ ] [AC-UI-1] [UI] A browser screenshot shows clean root provider icons in
  Dockside with no badge/icon collision.

## Scope

- Dockside grouped-root project badge and provider glyph placement.
- Provider glyph containment in root and child thread rows.
- Focused layout-contract tests and browser verification.

## Non-goals

- Changing project badge colors, initials, or project header layout.
- Changing provider artwork or status/PR metadata.
- Redesigning child disclosure, row density, or the two-row card structure.

## Verification

- Run Dockside's focused tests and typecheck.
- Build/reload the local Dockside plugin.
- Inspect the sidebar in the bound Steel browser and retain a screenshot
  showing one unobstructed leading project badge and one trailing provider
  glyph.

## Capability Deltas

See `deltas/dockside-thread-management.md`.
