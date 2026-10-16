# Decisions: Host Monitor Threshold Colors And Floating Scope

Record concise, externally reviewable evidence and choices here.

## D-001: Reuse one ordered resource presentation

Status: Accepted

### Evidence

React surfaces already share `thresholdToneForReading`, while the imperative
sidebar has CPU/RAM-only tones and duplicate resource lists.

### Options

1. Extend both renderers independently.
2. Extend only the existing tone object.
3. Return one ordered CPU/RAM/Disk presentation.

### Chosen approach

Return one ordered resource presentation and let compact and floating renderers
consume it.

### Trade-offs and risks

One small domain type removes duplicate metric membership, order, freshness,
and tone rules. The six-track floating grid remains a narrow-width risk.

### Verification

Assert order, labels, percentages, and tones for fresh, stale, unavailable, and
custom-threshold inputs.

## D-002: Mark existing body children instead of adding a wrapper

Status: Accepted

### Evidence

The current BB shell scopes plugin CSS to marked roots. React portals already
reuse `lib/portal-scope.ts`, but the imperative monitor and drag preview are
body children without those markers.

### Options

1. Apply shared attributes to both existing nodes.
2. Add a `display: contents` portal wrapper.
3. Copy critical CSS inline or add unscoped CSS.

### Chosen approach

Apply the shared scope attributes directly to the monitor surface and drag
preview.

### Trade-offs and risks

This keeps the existing fixed positioning, stacking, lifecycle, and cleanup
without adding a containing element or a second styling path.

### Verification

Inspect live DOM scope markers and computed fixed positioning, width, and
viewport containment.

## D-003: Keep resource and network presentation disjoint

Status: Accepted

### Evidence

Threshold tones and network directions are different policies, but the floating
helper currently accepts both as optional properties.

### Options

1. Keep the optional property bag.
2. Use separate helpers.
3. Use a discriminated internal option.

### Chosen approach

Use a small discriminated union in the existing helper.

### Trade-offs and risks

Call sites name the metric kind explicitly, making contradictory tone and
direction states unrepresentable without adding a new abstraction layer.

### Verification

Typecheck construction and render both threshold and network colors.
