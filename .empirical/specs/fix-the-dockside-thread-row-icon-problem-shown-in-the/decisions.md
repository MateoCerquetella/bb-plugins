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
