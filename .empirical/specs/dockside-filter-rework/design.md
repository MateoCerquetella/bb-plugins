# Design

## Existing surface

`ThreadInbox` owns the selected preset and renders `FilterMenu` in the compact
Projects header. `filterProjectThreadGroups` owns matching behavior. The
current Radix Select is accessible but presents seven undifferentiated labels
and communicates an active filter only by tinting a 24px icon.

## Proposed UI

Rename the section's visible label from Projects to Workspaces while retaining
project-backed data and the existing count. Keep the trigger in the trailing
action cluster. Its closed form is icon-only for All; for any other preset it
expands into a small rounded control containing the filter icon and the active
label. This makes filtered state explicit without consuming space normally.

The Select content becomes a 248px menu with a non-interactive `Filter
workspaces` heading, an All row, then Status and Inactivity groups separated by
subtle rules. Each option is a two-line row: a concise label and muted
description. The existing check indicator remains at the trailing edge. Radix
continues to provide focus management, keyboard selection, dismissal, and
portaling into BB's overlay scope.

`Status` is a standalone choice beside `All`. While selected, `ThreadInbox`
flattens the already searched project families and partitions them by the
existing `familyStatus` result. It renders non-empty sections in semantic
priority order (Failed, Needs you, Working, Unread, Inactive, Stale). Each
section uses the existing status presentation icon/color, count, disclosure,
and unchanged `ThreadCard` rows. Project view remains the All default.

## Data contract

Move display metadata into `thread-management.ts` as typed option records:
preset, label, description, and group. Derive labels and grouped option lists
from the same exhaustive metadata so UI copy and validation cannot drift from
the supported preset union. Matching logic and state ownership remain
unchanged.

## Styling and responsive behavior

Use only host theme tokens (`bg-popover`, `border-border`, `text-foreground`,
`text-muted-foreground`, `bg-sidebar-accent`, `text-primary`). The trigger's
active label is max-width constrained and truncates. Menu width is bounded by
the available viewport through Radix collision handling. No new CSS colors or
dependencies are introduced.

## Failure and compatibility

Unknown Select values remain ignored. If descriptions wrap, option height grows
without obscuring the label or check. Selection mode still hides the filter.
Non-All filtering continues to hide parked shelves and disable reorder; All
restores both through existing `ThreadInbox` conditions.

## Verification

Add unit assertions for complete metadata/group membership and a source-level
UI contract test covering the heading, menu groups, descriptions, active label,
and accessible naming. Run existing filter behavior tests, typecheck, plugin
build, repository checks, then install/reload and inspect both closed and open
states in the live sidebar.
