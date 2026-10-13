# Implementation Plan

1. Extend Thread Mobile's pure navigation helpers to select the current thread
   plus every live active or unread sidebar thread across projects, ordered by
   latest attention with deterministic fallbacks.
2. Resolve each selected thread's project from the sidebar projection and show
   a compact Dockside-compatible colored initial beside the title.
3. Reuse the existing live host indicator labels and add restrained
   reduced-motion-aware animation for working, waiting, error, and unread
   status icons.
4. Update focused tests, the plugin manifest copy, CLI description, and README
   so the cross-project behavior and exclusions are explicit.
5. Run focused tests, typecheck and plugin build; install/reload locally and
   exercise mobile navigation, boundaries, status changes, and desktop hiding.
