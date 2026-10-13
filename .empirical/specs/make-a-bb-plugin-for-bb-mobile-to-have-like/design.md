# Dockside Mobile Navigation Design

## Architecture

Dockside registers a native bare composer banner alongside its thread-list,
settings, and thread-header surfaces. The banner reads the active
thread from `useComposer()`, live visible threads from
`experimental_useSidebarThreads()` and navigates with `useBbNavigate()`.
The host owns placement, lifecycle and live subscriptions. The mobile
components and pure helpers live inside Dockside; the standalone Thread Mobile
package, registration, CLI, and lockfile workspace entry are removed.

## Data flow

1. Read the active composer thread identity.
2. Filter the projection to the current plus active/unread non-archived threads
   across every project and sort by latest attention.
3. Resolve the current row's project and effective badge presentation using
   `useProjectColors()` and Dockside's `projectBadgePresentation()`.
4. Derive the current index, controls and accessible status.
5. Invoke native navigation only after an arrow activation or accepted swipe.
6. Key the component by thread ID so pending gestures and navigation locks
   are discarded on route changes. BB owns request cancellation and recovery.

## Interaction

Use the current sidebar row's indicatorLabel verbatim for status, and "Idle"
only for indicator none. Unknown indicators without a label show "Status
unavailable". Keep status ellipsized with its full title and accessible text,
beside a nonshrinking position count. No polling or message reading is needed.

The title row includes an 18px colored project initial with readable foreground
and accessible project name. The strip has 44px icon buttons and a centered
title/position region. Pointer
tracking starts only on the title region, rejects vertical travel over 20px,
requires a 56px horizontal threshold, and never wraps. Keyboard arrows on the
title provide an equivalent accessible action.

## Styling

Host CSS variables, Dockside status timing, compact spacing, small radius and
muted metadata follow the repository design language. A max-width media query
hides the strip above 767px. Status motion honors `prefers-reduced-motion`.
Project-color persistence remains exclusively in Dockside.

## Verification

Pure navigation, badge and gesture helpers receive unit tests inside Dockside.
Dockside typecheck/build, workspace checks, local reload, and Steel
mobile/desktop checks cover runtime integration.

## Installation and release

Remove the existing Git-managed v0.1.5 installation only after the v0.1.6
package is built. Install the local package path with explicit approval, verify
BB reports Dockside v0.1.6 running and inspect its app bundle metadata. Commit
all durable workflow state, tag that exact commit `dockside/v0.1.6`, push the
branch and tag without force, and create the matching GitHub release.
