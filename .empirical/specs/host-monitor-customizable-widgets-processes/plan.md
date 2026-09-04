# Implementation Plan

1. **Restore process domain safely**
   - Restore the prior process collector, presentation helpers, per-host
     operation gate, and expiring confirmation store from commit `68a87da7e`.
   - Adapt imports/contracts to the current `.ts` package and add host-worker
     list/preflight/terminate handlers.
   - Add bounded server RPCs that resolve the explicit enrolled host, serialize
     operations, issue/consume identity-bound confirmations, publish refreshes,
     and return non-destructive offline/unsupported/unavailable states.
   - Restore and adapt focused collector, gate, confirmation, and server tests.

2. **Evolve persisted widget configuration**
   - Replace version-1 visible-panel-only config with a bounded version-2
     catalog-complete ordered widget model with stable ids and visibility.
   - Add snapshot-backed System and process-backed Processes widgets; keep
     existing resource/stat/timeseries combinations.
   - Normalize stored version-1 configs and corrupt/partial rows to a safe
     deterministic configuration; keep per-host store keys unchanged.
   - Extend pure tests for migration, uniqueness, show/hide, reorder, reset,
     visualization changes, and storage isolation.

3. **Build BB-native dashboard UI**
   - Introduce small vendored BB registry-compatible primitives for Button,
     Input, Badge, Skeleton, and AlertDialog composition as needed.
   - Refactor the page into compact sticky header, responsive host selector,
     selected-host strip, uniform widget grid, and ordered customization editor.
   - Implement shared pointer/button reorder logic, visibility toggles, reset
     draft, dirty-state protection, focus retention, live announcements, save
     failure preservation, and per-host reload persistence.
   - Remove numeric threshold chips/controls while retaining passive health
     evaluation and existing unlabeled chart guides.

4. **Add Processes widget and confirmation UX**
   - Fetch processes only for the selected connected host while the widget is
     visible; invalidate stale host-generation responses.
   - Add bounded filter/sort/refresh, wide table and narrow rows, protected
     reasons, manual/empty/error/offline/unsupported states, and retained rows
     during refresh.
   - Implement fresh preflight plus cancel-first graceful/force confirmation
     dialogs with explicit host/process/PID consequences and inline persistent
     outcomes. Live QA cancels confirmations rather than terminating arbitrary
     user processes.

5. **Verify and hand off**
   - Update browser QA for no reload, no numeric threshold chips, multi-host
     switching, widget visibility/order persistence, process states and dialog,
     wide layout, and 390px containment.
   - Run configured Host Monitor verification and root workspace check, install
     and reload the isolated plugin, visually inspect screenshots, and audit the
     exact base-relative diff for unrelated/generated changes.
   - Obtain isolated review, commit the implementation separately with a clear
     message, record evidence, and stop ready for review without push/merge/
     deployment.
