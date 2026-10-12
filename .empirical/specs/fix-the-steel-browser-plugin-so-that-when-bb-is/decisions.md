# Decisions

## D-001: Initialize the Existing Minimized State from Client Capabilities

Status: Accepted

### Evidence

The inline directive already removes the iframe while minimized and restores it
on demand; the regression suite already covers these transitions.

### Options

1. Add a separate mobile component.
2. Add a persisted setting.
3. Initialize the existing state from media queries.

### Chosen approach

Use the existing minimized state with phone-width/coarse-pointer media queries.

### Trade-offs and risks

A narrow desktop window also starts minimized, which is consistent with the
requested compact/mobile experience and avoids user-agent sniffing. Evaluate
once on mount so viewport changes never override an explicit user action.

### Verification

Exercise initial load, restore, minimize, and reload at mobile and desktop
profiles in the existing inline browser regression.

## D-002: Keep Desktop and Non-inline Surfaces Unchanged

Status: Accepted

### Evidence

The reported annoyance concerns the directive auto-opening on mobile; full
plugin pages and thread panels are deliberate navigation.

### Options

1. Apply the minimized default to every Steel surface.
2. Scope it to the inline directive.

### Chosen approach

Scope the behavior to `ScopedSteelBrowser` only.

### Trade-offs and risks

Mobile users who deliberately open the full plugin page still get the viewer,
which matches that explicit navigation.

### Verification

Assert desktop auto-load and mobile opt-in in the same browser regression, plus
run the existing plugin checks.
