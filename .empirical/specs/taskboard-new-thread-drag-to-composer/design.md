# Design: Taskboard New Thread Drag To Composer

## Context

Taskboard already registers `threadPanelAction` and
`experimental_newThreadPanelAction`; the latter renders the constrained board
with the root composer's selected project. Live BB 0.41 / SDK 0.4.34 testing
confirmed that **Show right panel → New tab → Actions → Taskboard** mounts that
component. The host can initially restore an unavailable empty tab, but the SDK
does not expose an imperative New Thread panel opener. Taskboard will preserve
the supported action registration and avoid host-DOM automation.

Taskboard already registers an `external-work-item` mention provider and uses
`composer.insertMention` after issue creation. Kanban cards already use native
HTML drag/drop to move provider status, while List rows are ordinary buttons.

## Solution

### Bounded drag identity

Add a small pure `composer-handoff.ts` module. It owns one private MIME type and
serializes only `{ provider, id, label }`, derived from the existing
`bbProjectId:source:locator` mention identity. Parsing accepts only an object
with the exact provider and bounded non-empty strings; unrelated or malformed
data returns null. Ticket titles, descriptions, comments, URLs, credentials,
and provider context never enter the drag payload.

### Constrained ticket sources

At `surfaceMode="constrained"`, make the List row's existing full-row open
button draggable and seed the bounded copy payload. Keep click/Enter opening
detail. Add a subtle non-focusable `DragDropVertical` glyph and grab cursor so
the capability is discoverable without adding another row action. Kanban cards
use the same quiet grip treatment, continue seeding their existing status-move identity, and
also seed the Taskboard mention payload; advertise `copyMove` so a lane drop
remains a move and a composer drop is a copy. Full-page List behavior stays
unchanged.

### Exact composer target

`TaskboardRightPanel` obtains the route-bound `useComposer()` controller and
installs capture listeners only while the panel is mounted. A drop qualifies
only when its event target is within an editable element with textbox semantics
inside a form and the transfer advertises Taskboard's MIME type. The handler
parses the identity, prevents native text/file insertion, marks the containing
form during dragover, calls `insertMention`, focuses the same route-bound
composer, and shows bounded success feedback. The accepted-drop treatment pairs
the outline with the short visible cue **Drop to add ticket to chat** so the
Kanban copy target is distinct from a status lane move. Both are removed on
dragleave, drop, dragend, and panel cleanup. It never calls navigation,
submission, send, queue, steer, or spawn APIs. Cleanup removes listeners and
any feedback marker.

The marker is styled with a restrained primary outline using host theme tokens.
This provides a visible accepted-drop state without restructuring or selecting
private BB components.

### Accessible equivalent

Ticket detail adds an **Add to chat** button beside the existing external-link
and **Send to agent** actions. It uses the same mention builder,
`insertMention`, and focus calls. It uses secondary styling and ordinary chat
iconography so it cannot be mistaken for **Send to agent**. A bounded polite
live status announces **Added <key> to chat** before focus settles in the
composer. The old **Send to agent** navigation remains available and unchanged.

### New Thread panel

Retain the existing `experimental_newThreadPanelAction` registration and add
focused coverage for its id, flush layout, project prop, and constrained
surface. README instructions will name the current supported host path. No
content script, synthetic keyboard command, or private right-panel selector is
introduced.

## Failure handling

- Missing or malformed drag data is ignored without touching the draft.
- A drag leaving the composer clears visual feedback.
- A Kanban lane drop continues through the existing optimistic move and
  rollback path; the composer handler does not run because the lane is not a
  composer textbox.
- `insertMention` is synchronous and host-owned. A rejected/absent host target
  produces no automatic fallback text, avoiding untrusted-context bypass.

## Verification

- Pure tests cover deterministic serialization, strict/bounded parsing, and
  rejection of malformed identities.
- UI source-contract tests cover constrained List drag wiring, Kanban
  `copyMove` plus existing lane movement, exact composer insertion/focus, the
  detail action, and New Thread panel registration.
- Taskboard typecheck/tests/build/build-metadata checks validate the bundle.
- Live BB verification exercises both root New Thread and an existing thread,
  confirms project following, observes drop feedback and the mention pill, and
  confirms no message is sent.
