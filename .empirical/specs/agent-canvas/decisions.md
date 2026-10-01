# Decisions: Agent Canvas

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The supplied screenshot shows a dark spatial canvas, large live chat panes, a
right Coordinator dock, and explicit canvas controls. BB's public SDK already
provides native ThreadChat and NewThreadComposer.

### Options

1. Rebuild chat and routing logic inside the plugin.
2. Use native BB chat surfaces inside a plugin-owned spatial shell.

### Chosen approach

Choose option 2: own layout, metadata, and gestures while delegating chat,
permissions, streaming, and thread creation to BB.

### Trade-offs and risks

Native surfaces constrain styling but preserve authorization and behavior.
Absolute positioning needs a narrow-screen fallback and bounded persisted
geometry.

### Verification

Typecheck/build, live install/reload, screenshot inspection, pane count check,
and page-error check.

## D-002: Universal Control and Colored Workspace Groups

Status: Accepted; supersedes earlier per-project coordinator and forced-dark
presentation choices.

The user's latest request makes the right-hand conversation universal and asks
for colored workspace squares, UI control, fluid gestures, and live agents and
browsers. Group project workspaces as square bounds; keep worktree context on
nodes and preserve recorded cross-workspace relationships. Use BB theme tokens
for application chrome and stable workspace-specific accents.

Store the selected Control identity on the server. Only that thread can execute
bounded visual commands; target one recently visible canvas and require an
acknowledgement before claiming success. Tools must never send messages or
escalate permissions. Native ThreadChat owns agent streaming. Browser visuals
use bounded periodic captures of verified automation tabs because the public
SDK does not expose an embeddable interactive browser stream.

Pane positions are stored relative to workspace groups in layout version 3.
Previous layout keys are preserved. Browser discovery runs independently from
thread status so unavailable hosts do not stall the graph.

## D-003: Free Pane Movement

Status: Accepted; supersedes workspace containment in D-002.

The user requested free movement. Workspace squares remain initial visual
groups, not drag boundaries. Persist signed relative positions with bounded
coordinates and retain pane size limits. A padded scroll plane permits movement
left and above the initial layout while preserving native timeline scrolling.
Background drag, Space-drag, middle-drag, and a pan toggle navigate the plane.
Fit and the overview include displaced panes as well as workspace groups.
