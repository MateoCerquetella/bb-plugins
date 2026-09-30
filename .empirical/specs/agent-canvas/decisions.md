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
