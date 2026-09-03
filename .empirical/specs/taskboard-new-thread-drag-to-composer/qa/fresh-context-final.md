# Fresh-context final QA

Overall: PASSED

Evidence is limited to the committed files at `bd2d857508325115ecfd5fae4ce7d17179128649` and the two supplied PNG captures. The focused suite completed with 28/28 tests passing.

- AC-1 — PASS. `app.tsx` registers both `threadPanelAction` and `experimental_newThreadPanelAction`; the New Thread panel passes its selected `projectId` to the constrained `TaskboardRightPanel`.
- AC-2 — PASS. Constrained List rows write the bounded Taskboard MIME payload; the document capture drop handler accepts only a visible composer textbox, inserts the parsed mention once, and focuses the composer.
- AC-3 — PASS. Kanban cards retain `text/plain` plus the Taskboard payload and `copyMove` behavior; lane drops still call `commitMove`, while composer drops are handled as mention insertion.
- AC-4 — PASS. Insertion uses `composer.insertMention()` and `composer.focus()` only; no submit/send/queue/thread-creation path is invoked, leaving the host draft, mentions, and attachments under composer control.
- AC-5 — PASS. Ticket detail renders an accessible `Add to chat` button with `type="button"`, routed through the same mention insertion callback.
- AC-6 — PASS. Serialization/parsing enforce the external-work-item provider, bounded `project:source:locator` identity, bounded safe label, exact payload keys, size limits, and fail-closed malformed/unrelated data handling.
- AC-7 — PASS. The committed focused tests cover payload round-tripping, rejected payloads/DataTransfer failures, both panel registrations, List/Kanban drag wiring, Add to chat, and absence of automatic submission.
- AC-UI-1 — PASS. `app.css` supplies active dashed composer targeting, a visible “Drop to add ticket to chat” cue, and drag grips. `new-thread-drag-active.png` shows the active cue/target; `new-thread-drop.png` shows the inserted `TEST-1` pill in New Thread with “Added TEST-1 to chat” and no navigation/submission.
