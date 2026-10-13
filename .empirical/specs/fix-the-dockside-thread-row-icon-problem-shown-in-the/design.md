# Design

## Existing behavior

Main renders a provider glyph in the grouped root's leading grid column. The
project-first presentation adds a project badge to that same identity area,
which produces the screenshot's provider/project collision when the two
placements are combined.

## Solution

Pass the project name and configured color override from `ProjectGroup` into
`ThreadCard`. For grouped roots, render one `size-5` project badge in the
leading grid cell using the existing `projectBadgePresentation` and
`projectBadgeLetter` helpers. Do not render a provider glyph in that cell.

Render the root provider exactly once in `data-dockside-root-metadata`,
immediately before `FamilyStatusIcon`. Keep the shared fixed glyph box so the
provider and status align. Selection mode omits both non-selection identities
and continues to put the checkbox in column one.

Keep child provider placement unchanged because child rows have no project
badge and therefore no collision.

## Data and boundaries

No persistence, backend, SDK, or public API changes are required. Project color
selection continues to come from `useProjectColors`; only existing values are
threaded into `ThreadCard`.

## Verification

Extend the source-level layout contract to prove a single root
`ProviderGlyph`, its ordering before `FamilyStatusIcon`, an accessible leading
project badge, and no provider glyph in the leading project segment. Run the
Dockside test/type/build commands, install and reload the local plugin, then
capture the live sidebar at compact density.
