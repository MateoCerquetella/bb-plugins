# Decisions: Finish Pr 83 Keep The Aura New Thread Composer Thread

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The installed UI screenshot shows two Activity overview headings. The plugin
registers a homepage slot titled `Activity overview` and its component also
renders an `h2` with the same text. AURA's current layout CSS targets the
host-owned New Thread panel and already separates centering rules into
`COMPOSE_CENTER`.

### Options

1. Hide or reposition host elements through broader CSS selectors.
2. Keep the host slot title, remove the component's duplicate heading, and
   limit centering to the native compose container.

### Chosen approach

Keep the host title as the single accessible heading. Remove only the duplicate
component title. Adjust the narrow AURA centering rules against the observed
native compose container without cloning, moving, or replacing host controls.

### Trade-offs and risks

The layout depends on host IDs and test IDs. Live desktop and mobile inspection
will catch selector drift. Retaining the host title means the plugin cannot
style that title from inside its component, but avoids duplicate semantics and
brittle parent targeting.

### Verification

Behavioral component tests shall prove the overview has no duplicate internal
heading while retaining its labeled regions and controls. Live browser checks
shall prove one visible heading, centered native composition, reachable
controls, and no horizontal overflow at desktop and mobile widths.
