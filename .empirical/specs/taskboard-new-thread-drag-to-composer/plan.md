# Implementation plan

1. Add `plugins/taskboard/composer-handoff.ts` with a bounded
   `external-work-item` mention builder, private MIME serializer, strict parser,
   DataTransfer writer, and composer-textbox target helper. Add pure unit tests
   for valid and rejected payloads.
2. In `app.tsx`, centralize route-bound composer insertion in
   `TaskboardRightPanel`, including one polite live announcement and scoped
   document drag listeners that activate only for Taskboard payloads over a
   semantic editable textbox.
3. Wire constrained List rows as copy drag sources with a subtle grip and grab
   cursor. Thread the constrained flag through list groups without changing
   full-page List behavior.
4. Extend existing Kanban drag starts to add the same copy payload and use
   `copyMove` only on the constrained surface, while retaining the current lane
   item identity, drop handlers, keyboard moves, optimistic update, and rollback.
5. Add the conventional **Add to chat** detail button using the same insertion
   callback and keep **Open** and **Send to agent** unchanged.
6. Add theme-token CSS for drag-source discoverability, the accepted composer
   outline, and the short **Drop to add ticket to chat** cue, including reduced
   motion and cleanup-safe states.
7. Extend focused Taskboard UI source-contract coverage for List/Kanban wiring,
   detail fallback, New Thread panel registration, live-status feedback, and
   absence of submit/navigation in the insertion path.
8. Update Taskboard README usage to document New Thread's supported right-panel
   path and both drag/button mention insertion behaviors.
9. Install dependencies if needed, run focused tests and typecheck, then run the
   Taskboard workspace check and production build verification.
10. Compare the current checkout with the running Taskboard 0.3.3 path before
    changing the live installation. Do not downgrade or overwrite newer
    unmerged Taskboard behavior; if safe, move the local path install to this
    checkout, reload, and inspect status/logs.
11. Exercise the existing-thread and root New Thread flows in the running BB,
    capture screenshot evidence, run the required independent review, address
    findings, and integrate the capability deltas without publishing.
