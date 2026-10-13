# Implementation Plan

1. Move the mobile navigation component, icons, styles, and pure helpers into
   Dockside and register its bare composer banner from Dockside's app entry.
2. Replace the copied automatic badge logic with Dockside's
   `projectBadgePresentation()` plus live overrides from `useProjectColors()`.
3. Move and extend focused navigation tests under Dockside, including
   cross-project selection, custom project color presentation, status mapping,
   boundaries, and gesture rejection.
4. Delete the standalone `plugins/thread-mobile` package, remove its root
   plugin catalog and lockfile workspace entries, and update Dockside/root docs.
5. Run Dockside tests/typecheck/build, install and reload Dockside, perform the
   available mobile UI check, sync with main, commit, and push.
