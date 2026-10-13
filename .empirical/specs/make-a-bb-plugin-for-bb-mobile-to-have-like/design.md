# Thread Glide Design

## Architecture

Thread Glide registers a native bare composer banner. It reads the active
thread from `useComposer()`, live visible threads from
`experimental_useSidebarThreads()` and navigates with `useBbNavigate()`.
SDK inspection found these APIs preferable to a content script and portal:
the host owns placement, lifecycle and live subscriptions. A read-only backend
CLI lists project roots for inspection.

## Data flow

1. Read the active composer thread identity.
2. Filter live visible sidebar threads and normalize stable ordering.
3. Derive the current index, controls and accessible status.
4. Invoke native navigation only after an arrow activation or accepted swipe.
5. Key the component by thread ID so pending gestures and navigation locks
   are discarded on route changes. BB owns request cancellation and recovery.

## Interaction

Use the current sidebar row's indicatorLabel verbatim for status, and "Idle"
only for indicator none. Unknown indicators without a label show "Status
unavailable". Keep status ellipsized with its full title and accessible text,
beside a nonshrinking position count. No polling or message reading is needed.

The strip has 44px icon buttons and a centered title/position region. Pointer
tracking starts only on the title region, rejects vertical travel over 20px,
requires a 56px horizontal threshold, and never wraps. Keyboard arrows on the
title provide an equivalent accessible action.

## Styling

Host CSS variables, compact spacing, small radius and muted metadata follow
the repository design language. A max-width media query hides the strip above
767px. No new persistent state or thread mutations are introduced.

## Verification

Pure navigation and gesture helpers receive unit tests. Plugin typecheck/build,
workspace checks, local install/reload, and Steel mobile/desktop checks cover
runtime integration.
