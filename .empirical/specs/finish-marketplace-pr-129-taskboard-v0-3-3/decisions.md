# Decisions: Finish Marketplace PR 129 with Taskboard 0.3.3

## D-001: Supersede rather than rewrite Taskboard 0.3.2

Status: Accepted

### Evidence

- Public annotated tag `taskboard/v0.3.2` peels to
  `2d90bd3be0aab8a3641e368536bbe441150e6580` and has a published GitHub Release.
- That commit carries the thread-header ticket icon but is a sibling of the
  locally verified marketplace-review fix; it lacks the Plan containment,
  production-only install, and GitHub CLI hardening changes.
- Marketplace release tags are immutable and must never be moved or replaced.

### Options

1. Delete or retarget `taskboard/v0.3.2` to the reviewed fix.
2. Publish the complete, non-regressing candidate as a new `taskboard/v0.3.3`
   release and raise the marketplace source floor.

### Chosen approach

Preserve `taskboard/v0.3.2` exactly and prepare one `0.3.3` candidate containing
both the already-published ticket-icon behavior and every reviewed PR fix. Point
the prepared marketplace entry at `^0.3.3`.

### Trade-offs and risks

The extra patch version is unavoidable release history, but it keeps existing
installations and provenance honest. A regression test pins the carried-forward
icon, while clean-consumer and security tests pin the reviewed fixes.

### Verification

- Recheck the public `0.3.2` tag object and peeled commit without mutation.
- Diff the `0.3.3` candidate against both public main and the `0.3.2` tag.
- Run the complete source and marketplace validation matrix before presenting
  any remote commands.

## D-002: Preserve the existing assisted-draft interaction hierarchy

Status: Accepted

### Evidence

- Composer-assisted entry is already an explicit user choice from a non-empty
  composer; opening the ordinary board create flow remains manual.
- The modal's live status states that a model reads relevant repository context,
  keeps “Use original prompt” available, renders generated fields as editable,
  announces failure with the original prompt restored, and retains a separate
  explicit Create action.
- The `0.3.3` UI requirement is only to preserve the released thread-header
  `Ticket` icon and existing pin behavior.

### Options

1. Redesign the modal and action hierarchy during the release-blocker fix.
2. Preserve the existing disclosed loading/success/fallback states and separate
   creation confirmation, changing only the released header glyph.

### Chosen approach

Use option 2. Treat the UI/UX consult's concrete states as regression targets,
retain the modal's existing disclosure and recovery affordances, and make the
header change an exact `PanelRight` to `Ticket` icon substitution.

### Trade-offs and risks

This avoids widening a release/security fix into a modal redesign. Provider name
presentation remains governed by the existing project context rather than a new
layout; documentation and marketplace copy carry the broader model-usage detail.

### Verification

- Focused UI-source tests pin the header icon, accessible label, and absence of
  the generic panel icon.
- Existing app tests and the root suite continue to cover assisted modal loading,
  fallback, editable fields, and separate issue creation.
