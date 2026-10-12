# Dockside Thread Management Delta

## MODIFIED Requirements

### Requirement: Root family cards have exactly two semantic rows

Every root MUST render exactly two compact fixed rows using the existing
two-column grid. Row one MUST contain the family state/activity icon, truncated
title, and far-right elapsed time. Row two MUST contain truncated branch text
and one shrink-resistant right cluster with the readable state badge, root-only
PR metadata, and child disclosure/count plus provider identity. Children MUST
never render PR metadata. Ambiguous icons MUST offer hover and keyboard-focus
help. Source-contract tests MUST describe the current two-column placement and
MUST NOT require an obsolete third grid column.

#### Scenario: Repository CI validates the current root-card grid

- **Given** the runtime root card places its metadata cluster in grid column 2
- **When** the Dockside source-contract test runs
- **Then** the assertion expects `col-start-2`
- **And** no Dockside runtime component, styling, layout, or behavior changes
