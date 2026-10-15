# Decisions

## D-001: Use the existing host right panel

Status: Accepted

### Evidence

Evidence: app.tsx already registers steel-live-browser using threadPanelAction, Monitor and flush layout. The SDK exposes openThreadPanel but no panel width API.

### Options

- Expand the existing panel.
- Patch host layout or move iframe through a portal.

### Chosen approach

 open that surface via SDK, expand plugin content within a stable anchor.

### Trade-offs and risks

Alternative: patch BB host layout; rejected because it adds version coupling. Risk: clipping/stacking in actual host.

### Verification

Verify installed UI.

## D-002: Preserve the iframe while resizing

Status: Accepted

### Evidence

LiveViewer renders the authenticated iframe and holds clipboard/control state in component refs. Moving it across containers would lose those refs and reconnect the stream.

### Options

- Resize the existing element.
- Create a second viewer.

### Chosen approach

 change section geometry in place; avoid portal relocation. Existing LiveViewer uses iframe-based authenticated transport and human control state. Resizing must not reconnect the stream.

### Trade-offs and risks

Avoid losing browser state.

### Verification

Verify iframe identity and load count.

## D-003: Display branding only

Status: Accepted

### Evidence

Use Cerq Browser pending the requested name preference. Preserve steel-browser command/directive/plugin identifiers for existing agents and project state. A protocol/package rename is outside this UI request and would need migration.


### Options

- Display branding only.
- Rename persistent IDs and CLI.

### Chosen approach

Display branding only.

### Trade-offs and risks

Keep existing commands and installation compatible.

### Verification

Run browser UI and CLI checks.
