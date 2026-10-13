# Implementation Plan

1. Change Dockside's pure neighbor helper to wrap in either direction when the
   eligible queue contains at least two threads, while retaining `null` for an
   empty queue, a missing current thread, or a singleton queue.
2. Extend focused helper tests for last-to-first, first-to-last, ordinary
   neighbors, missing-current safety, and singleton safety. Confirm buttons,
   keyboard arrows, and swipes still delegate through the same helper.
3. Update Dockside documentation and package version for the continuous
   navigation behavior without changing the existing mobile layout or queue
   ordering.
4. Run Dockside's focused tests, typecheck, build, and the configured workspace
   verification. Install and reload the local Dockside package and verify the
   plugin is running with the new version and a compatible app bundle.
5. Perform the required UI evidence and fresh-context review, integrate the
   capability update, sync with `main`, commit, and push the exact verified
   source.
6. Create a new immutable Dockside patch tag and GitHub release from that exact
   commit. Never move or replace the published `dockside/v0.1.6` tag.
