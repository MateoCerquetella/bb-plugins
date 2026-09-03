# Decisions: Fix The Installed Intel Mac Touch Bar Native Companion Because

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The user reports that both thread and settings touches remain broken and
explicitly requires finger scrolling without arrows. The previous repair
converted hit-test points and dispatched actions from `mouseDown`, which can
reject controls and turn swipes into clicks.

### Options

1. Keep custom immediate dispatch and add more coordinate conversions.
2. Remove scrolling and use paging controls.
3. Keep native horizontal scrolling, use local hit testing, and let AppKit
   complete button tracking before sending actions.

### Chosen approach

Choose option 3. Preserve the scroll container, remove child `mouseDown`
dispatch, and use receiver-local hit-test points so AppKit distinguishes taps
from horizontal drags.

### Trade-offs and risks

The native path still depends on macOS Touch Bar APIs, but this repair changes
only input routing. Standard AppKit tracking may alter press feedback; physical
hardware verification covers that trade-off.

### Verification

Focused/root tests, Intel Mac rebuild/install, and human settings/thread taps
plus a swipe on the running app.
