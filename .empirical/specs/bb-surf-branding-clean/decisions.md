# Decisions

## D-001: Display rename only

Status: Accepted

### Evidence

Current BB-owned labels can change without changing the `steel-browser`
package, plugin, path, command, storage, fixture, or infrastructure names.

### Options

Rename display copy only, or migrate every technical identifier.

### Chosen approach

Rename current BB-owned display copy and preserve technical identifiers and
Steel Browser upstream attribution.

### Trade-offs and risks

The visible product name and compatibility names intentionally differ.

### Verification

Audit remaining matches and run the focused checks.

## D-002: Suspend hover sampling while pinned

Status: Accepted

### Evidence

Pointer position cannot collapse a panel while explicit expansion is pinned,
but the existing hover sampler still runs.

### Options

Keep sampling in every mode, or stop sampling while pinned.

### Chosen approach

Return from the hover effect while pinned. Let the existing effect restart when
the panel returns to compact mode.

### Trade-offs and risks

The change must preserve keyboard, visibility, resize, touch, and explicit
shrink behavior.

### Verification

Assert the interval lifecycle in the browser fixture and exercise the existing
expansion paths.
