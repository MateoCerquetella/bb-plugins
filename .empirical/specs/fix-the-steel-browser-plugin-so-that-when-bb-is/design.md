# Design

## Current Behavior

`ScopedSteelBrowser` initializes `minimized` to `false`, so an active latest
directive immediately mounts `LiveViewer`. `LiveViewer` creates an iframe whose
`src` is the authenticated viewer URL. This occurs equally on desktop and
mobile.

## Proposed Behavior

Add a small pure client detector that classifies a device as mobile when either
the viewport is phone-width (`max-width: 640px`) or the primary pointer is
coarse. Use it only as the lazy initializer for the inline directive's
`minimized` state.

The existing render conditions already avoid mounting `LiveViewer` while
minimized, stop polling the hidden directive, expose an accessible Restore
button, and reconnect the stream after restoration. Therefore no viewer,
provisioning, or session API changes are required.

## Boundaries

- The standalone plugin page and thread panel retain their current behavior.
- The mobile default is evaluated when each directive mounts. Resizing later
  does not override a user's current minimize/restore choice.
- Desktop initialization remains expanded.

## Verification

- Extend the inline browser test to emulate an actual mobile viewport with a
  coarse pointer and assert zero initial iframe loads.
- Restore explicitly and assert the iframe loads once and remains interactive.
- Preserve the desktop initial-load and minimize/restore assertions.
- Capture desktop and mobile screenshots from the browser regression.
- Run Steel Browser checks and repository-required verification.
