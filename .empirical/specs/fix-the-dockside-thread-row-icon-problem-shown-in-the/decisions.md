# Decisions

## D-001: Separate project and provider identity by column

Status: Accepted

### Evidence

The supplied screenshot shows provider artwork and a project initial occupying
the same leading position. Repository history establishes project-colored
grouped roots and a trailing metadata cluster.

### Options

Keep only provider identity; keep only project identity; overlay both; place
project identity left and provider identity beside status.

### Chosen approach

Place project identity left and provider identity immediately before family
status.

### Trade-offs and risks

Trailing metadata gains one 14px glyph, so title/branch remain the flexible
truncation targets. Identity is no longer duplicated.

### Verification

Layout-contract assertions plus a live sidebar screenshot.

## D-002: Reuse existing project-color helpers

Status: Accepted

### Evidence

Project headers already use `projectBadgePresentation` and
`projectBadgeLetter`, including user overrides and readable foregrounds.

### Options

Duplicate the badge logic; introduce a new badge component; pass project
identity into `ThreadCard` and reuse the existing pure helpers.

### Chosen approach

Pass project name/color into `ThreadCard` and use the same helpers.

### Trade-offs and risks

Recomputing presentation twice is harmless but can be consolidated later; this
repair stays local and behaviorally identical to the header.

### Verification

Existing project-color tests and Dockside typecheck.

## D-003: Contain the external provider overlay inside Dockside families

Status: Accepted; supplements D-001 and supersedes the assumption that moving
Dockside's own provider glyph removes every duplicate.

### Evidence

The installed thread-provider-icons overlay inserts a span marked
`data-thread-provider-icon` into each thread row's first direct span. In
Dockside's grouped roots that span is the project initial badge, explaining
the user's new screenshot despite the existing trailing provider glyph.

### Chosen approach

Hide only injected provider marks beneath `data-dockside-family` with a scoped
CSS rule overriding the overlay's inline display. Preserve Dockside's own
provider glyphs, navigation anchors, selection controls, and child layout.
Do not disable the external plugin or mutate its observer-managed DOM.

### Verification

Added a focused layout regression; tests remain pending during iteration.
Bundle build succeeded. Steel's existing BB page requires sign-in, so live
visual verification remains pending.
