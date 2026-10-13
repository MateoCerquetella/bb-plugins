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
6. Remove the installed v0.1.5 only after the v0.1.6 build is ready, install
   the local Dockside path, and verify version, running status, source, and app
   bundle compatibility.
7. Commit and push the final workflow state, ensure `dockside/v0.1.6` does not
   already exist, create the immutable tag on the verified commit, push it, and
   create the matching GitHub release with concise notes.
