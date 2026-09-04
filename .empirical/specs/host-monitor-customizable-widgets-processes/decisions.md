# Decisions

## D-001: Persist a catalog-complete ordered widget list

Status: Accepted

### Evidence

- Version 1 persists only currently rendered panels, so removal loses position
  and cannot distinguish hidden from absent.

### Options

1. Continue treating removal as hidden.
2. Persist free-form grid coordinates.
3. Persist every bounded catalog widget in order with a visible flag.

### Chosen approach

Choose option 3 and migrate version-1 rows deterministically.

### Trade-offs and risks

The schema changes, but stays small, strict, catalog-backed, and easy to migrate.
It does not support arbitrary grid coordinates or resizing.

### Verification

Pure schema/config tests plus per-host store reload/isolation tests.

## D-002: Restore the prior two-step process safety model

Status: Accepted

### Evidence

- Commit `68a87da7e` contains a previously tested cross-platform collector,
  opaque identity, conservative policy, operation gate, and confirmation-token
  flow. The current branch removed the entire surface rather than finding a
  defect in that safety model.

### Options

1. Add read-only process names.
2. Implement direct one-click termination.
3. Restore and adapt the prior safety-reviewed two-step workflow.

### Chosen approach

Choose option 3, retaining its bounds and protections and embedding it only in
the explicitly selected host's Processes widget.

### Trade-offs and risks

This reintroduces a destructive capability and more code. Conservative policy
means some legitimate processes cannot be controlled, which is preferable to
guessing identity or ownership.

### Verification

Restore/adapt process unit and server tests, plus live protected/actionable row
and confirmation-cancel inspection without terminating an arbitrary user task.

## D-003: Use ordered drag-and-drop with an equivalent button path

Status: Accepted

### Evidence

- The user requested Grafana-style rearrangement, while drag-only interaction is
  inaccessible and brittle on touch devices.

### Options

1. Up/down buttons only.
2. Pointer drag only.
3. HTML drag-and-drop plus move-earlier/later controls sharing one pure reorder.

### Chosen approach

Choose option 3. Drag is an enhancement; keyboard/button operation remains the
complete workflow.

### Trade-offs and risks

Native HTML drag has limited touch support, but the parallel controls work on
touch, keyboard, and assistive technology without a new dependency.

### Verification

Pure reorder tests and browser exercise of both drag and button paths.

## D-004: Remove numeric UI without removing passive guides

Status: Accepted

### Evidence

- The user explicitly asked to remove the numeric threshold control while prior
  requirements depend on passive threshold state.

### Options

1. Remove thresholds and warning state entirely.
2. Keep numeric controls/chips.
3. Hide numeric controls/chips while retaining passive evaluation and unlabeled
   chart context.

### Chosen approach

Choose option 3.

### Trade-offs and risks

Operators cannot tune guides from the dashboard, but health emphasis remains
consistent with configured values and no existing monitoring behavior regresses.

### Verification

Browser/source assertions for no numeric chips or dashboard threshold controls,
with threshold-state unit coverage retained.

## D-005: Keep layout editing separate and block ambiguous host changes

Status: Accepted

### Evidence

- The UI/UX consult identified accidental host switching and data-heavy inline
  card controls as high-risk sources of draft loss and clutter.

### Options

1. Put edit controls in every live widget and discard on host switch.
2. Prompt with a browser confirm for every interaction.
3. Use a separate ordered editor plus live preview, disable host changes while
   dirty, and protect browser unload.

### Chosen approach

Choose option 3 with explicit save/cancel guidance and persistent inline errors.

### Trade-offs and risks

Operators must finish or cancel customization before switching hosts, but no
ambiguous draft is silently discarded and the live dashboard stays readable.

### Verification

Frontend behavior tests and browser exercise of dirty, failed-save, cancel, and
host-switch states.

## D-006: Use explicit cancel-first process confirmations

Status: Accepted

### Evidence

- The UI/UX consult requires host/process identity, mode consequences, and
  cancel-first focus for destructive actions.

### Options

1. One generic confirmation.
2. Inline one-click actions.
3. Separate graceful and force preflight dialogs with action-specific labels.

### Chosen approach

Choose option 3 and keep all results in a persistent polite live region plus
visible inline status.

### Trade-offs and risks

The extra step is deliberate friction for a destructive operation.

### Verification

Process server tests plus live confirmation-cancel inspection.
