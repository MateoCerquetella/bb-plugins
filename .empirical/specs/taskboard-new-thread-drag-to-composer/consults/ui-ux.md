# UI/UX Specialist Review

Specialist: `ui-ux`

Verdict: advisory

## Answer

Yes. Within the supported BB/Plugin SDK boundaries stated in the spec and
design, this is the clearest interface for the criteria: Taskboard remains an
explicit right-panel Action on both an existing thread and root New Thread;
the constrained board is the source; the visible composer is the destination;
and **Add to chat** is the accessible non-drag equivalent. The interaction
preserves the user's current route, draft, attachments, and final control over
submission.

Concretely, it should look and behave as follows:

- On root New Thread, **Actions → Taskboard** opens a constrained Taskboard for
  the project currently selected by that composer. The same Action remains
  available beside an existing thread.
- In constrained List view, the existing ticket row still opens detail on
  click or Enter, while a small grip glyph and grab cursor make the whole row's
  drag capability discoverable. Full-page List rows remain unchanged.
- In constrained Kanban, the existing card remains draggable. Hovering a lane
  retains the current status-move presentation; hovering the composer instead
  changes the cursor/feedback to a copy action and gives the composer a
  restrained primary outline plus the short cue **Drop to add ticket to chat**.
  This distinction is important because one source card has two valid drop
  meanings.
- A successful drop inserts one live `external-work-item` pill into the
  existing draft, keeps the right panel and route in place, focuses the
  composer, and gives a brief non-modal confirmation such as **Added ABC-123 to
  chat**. Nothing should resemble a sent-message state.
- Ticket detail presents **Add to chat** as a normal button beside the existing
  external-link and **Send to agent** actions. Activating it performs the same
  insertion and focus behavior as a drop; the confirmation is exposed through
  a polite live status so keyboard and screen-reader users receive the result.

Deliberately ruled out are automatic panel opening through private host DOM,
content scripts or synthetic keyboard commands; auto-submission, queueing,
steering, navigation, or thread creation; fallback insertion as plain text;
changing Kanban lane/status semantics; making full-page List rows draggable;
and adding ticket content, URLs, credentials, or provider context to the drag
payload. The restored unavailable New Thread tab is a host limitation; the
supported Action is the correct affordance and should not be disguised with a
fragile self-healing interaction.

## Findings

### Finding 1

- Severity: medium
- Category: interaction clarity
- Location: `design.md` — Solution / Exact composer target
- Recommendation: Specify the accepted-drop state as more than an outline.
  Pair the restrained host-token outline with the brief visible cue **Drop to
  add ticket to chat**, and clear both on dragleave, drop, and panel cleanup.
  This makes the Kanban card's copy-to-composer meaning visibly distinct from
  its existing move-to-lane meaning without restructuring the host composer.

### Finding 2

- Severity: medium
- Category: accessibility and feedback
- Location: `design.md` — Solution / Accessible equivalent and Failure handling
- Recommendation: Make **Add to chat** a conventional keyboard-focusable
  button and expose successful insertion through a bounded polite live status,
  for example **Added ABC-123 to chat**, before focus settles in the composer.
  Show success only after `insertMention` is invoked with a valid identity; do
  not show an accepted or successful state for malformed or unrelated payloads.

### Finding 3

- Severity: low
- Category: discoverability
- Location: `design.md` — Solution / Constrained ticket sources
- Recommendation: Add a subtle, non-focusable grip glyph and grab cursor to
  draggable constrained List rows and Kanban cards while retaining the entire
  existing row/card as the drag source. Keep click/Enter opening detail, avoid
  a second competing row action, and leave full-page List presentation intact.

### Finding 4

- Severity: low
- Category: action hierarchy
- Location: `design.md` — Solution / Accessible equivalent
- Recommendation: Keep **Add to chat** adjacent to, but semantically distinct
  from, **Send to agent**. The former should use ordinary secondary-action
  styling and never borrow send/launch iconography; the latter stays unchanged.
  This prevents users from reading mention insertion as an automatic handoff
  or submission.

### Finding 5

- Severity: low
- Category: host integration
- Location: `spec.md` — Non-goals; `design.md` — New Thread panel
- Recommendation: Treat the registered **Taskboard** Action and the documented
  **Show right panel → New tab → Actions → Taskboard** path as the complete New
  Thread affordance available in the current SDK. Do not add an in-composer
  button, private selector, or automatic tab recovery unless a future public
  SDK surface explicitly supports it.
