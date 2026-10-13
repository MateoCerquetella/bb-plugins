# Design

Retain the existing threadPanelAction Monitor icon and use useBbNavigate.openThreadPanel from a new handoff button. BB owns panel tabs and close controls. Keep the inline viewer as an available fallback so older clients and manual handoffs remain usable.

Wrap the thread viewer in a stationary host-sized anchor. The same section becomes fixed-position while expanded, using the anchor's viewport top/right/bottom geometry and a bounded ~90vw width. No portal or iframe remount occurs during resizing. Preserve a strip of conversation on the left; no overlay backdrop, dialog semantics or focus trap.

A dedicated hook owns a 2000ms pointer dwell timer and compact/hover/pinned modes. Fine mouse pointers expand automatically. Leave collapses hover mode; explicit expand pins. Blur, hidden document, Escape and unmount clear timers. ResizeObserver and viewport resize update geometry. Manual shrink suppresses another hover until re-entry. Touch never schedules automatic expansion.

Use BB foreground/background/border/muted/accent/primary/ring tokens, inherited typography and compact icon controls. Rename visible manifest/navigation/headings to Cerq Browser, preserving steel-browser source paths, SDK IDs, directives, CLI and persistent project state.

Verify actual cross-origin iframe dwell, cancellation, geometry and unchanged viewer load count with Playwright attached to the bound project CDP. Cover manual keyboard controls, narrow and coarse-pointer clients, light/dark screenshots and local plugin installation. Existing inline and human-control suites remain valid.
