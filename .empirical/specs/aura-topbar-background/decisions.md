# Decisions: Aura top bar background

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Hide the wallpaper from the top bar

Status: Accepted

### Evidence

The installed BB 0.48 thread DOM places a `header` with the translucent
`bg-surface-scrim` inside Aura's decorated panel. Aura prepends
`.aura-capy-layer` at `inset: 0`, so the wallpaper renders behind that scrim.
The New thread screen has no page header but reserves the same
`--bb-app-chrome-row-height` band above the composer.

### Options

1. Restyle the host `header` with an opaque background.
2. Offset the decorative `.aura-capy-layer` below the chrome row.
3. Remove the wallpaper entirely.

### Chosen approach

Offset the decorative layer using `top: var(--bb-app-chrome-row-height, 48px)`
when the new preference is off, and keep `top: 0` when it is on. Leave the host
header untouched.

### Trade-offs and risks

Clipping the layer leaves a theme-colored band on the New thread screen instead
of guessing the host's scrim color. The host token or layout may change; the
fallback and a live installed-UI check guard against that. Restyling the header
would risk host controls and drag behavior.

### Verification

A focused CSS assertion shall prove the emitted rule uses the chrome token in
the off state and zero in the on state. A live browser check shall confirm the
top bar band no longer shows the wallpaper with the preference off.

## D-002: Persist the preference globally

Status: Accepted

### Evidence

`server.ts` already distinguishes global preferences (`enabled`,
`newThreadOnly`, `dimmerEnabled`, `activityOverview`) from per-slot appearance
through the `appearance()` helper, and carries them across `activateSlot` and
`reset`.

### Options

1. Store the preference inside each saved slot.
2. Store it globally and preserve it across slot switches and reset.

### Chosen approach

Add `topbarBackground` to the global preference set, exclude it from the
appearance comparison, and carry it across slot activation and reset.

### Trade-offs and risks

A slot cannot override the top bar preference independently. That matches every
other display-scope preference and keeps the new control predictable. Tests
shall cover slot switching and reset so the preference cannot silently reset.

### Verification

Focused server tests shall switch a slot and reset the background after setting
the preference and assert it remains off/on as selected. A legacy-settings test
shall assert an old snapshot loads with `topbarBackground` defaulting to false.

## D-003: Save with Apply background

Status: Accepted

### Evidence

The existing **New thread screen only** and **Half wallpaper** checkboxes edit
the local draft and persist with **Apply background**. Activity overview is the
only immediate-save exception because it gates a separate data surface.

### Options

1. Add a dedicated immediate-save RPC like `setActivityOverview`.
2. Add the checkbox to the existing draft fieldset and save with Apply.

### Chosen approach

Add the checkbox to the existing draft fieldset and save it with **Apply
background**, reusing the existing apply, slot-save, and error paths.

### Trade-offs and risks

The preference changes only after Apply, which is consistent with the adjacent
appearance controls. It avoids a second RPC and busy-state branch, and preserves
the current draft behavior.

### Verification

A unit test shall assert the setting round-trips through `apply`. The live UI
check shall toggle the checkbox, apply, reload, and confirm the persisted state.

## D-004: Keep the change as one feature

Status: Accepted

### Evidence

The contract is seven criteria across one capability, all describing one
preference and its single rendering effect.

### Options

1. Split schema/CSS, UI, and release into separate features.
2. Keep one cohesive change.

### Chosen approach

Keep one feature containing the schema, CSS, checkbox, tests, version bump, and
pull request.

### Trade-offs and risks

The change crosses plugin code and release metadata, but it is small and
reversible. Splitting would separate the setting from the only behavior it
controls and add release overhead without reducing risk.

### Verification

The repository's Aura-focused check and the live installed-UI check cover the
whole change; the PR carries the version bump with the implementation.
