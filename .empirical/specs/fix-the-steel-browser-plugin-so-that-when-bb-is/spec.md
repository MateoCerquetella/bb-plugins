# Fix The Steel Browser Plugin So That When Bb Is

## Request

> Fix the steel-browser plugin so that when BB is being used on mobile it does not automatically open the browser link/viewer, while preserving appropriate desktop behavior; add or update tests, run required verification, create a pull request, and merge it.

## Goal

Prevent the inline Steel viewer from loading automatically on mobile while
retaining the existing automatic desktop viewer experience and an explicit
mobile control for opening the viewer.

## Acceptance Criteria

- [ ] [AC-1] On a phone-width or coarse-pointer client, a newly rendered
  `::steel-browser{}` directive starts minimized and does not create a viewer
  iframe or request its URL.
- [ ] [AC-2] A mobile user can explicitly restore the inline viewer, after
  which the iframe loads and the existing controls remain available.
- [ ] [AC-3] On a desktop client, a newly rendered directive retains the
  existing automatic viewer load.
- [ ] [AC-4] Minimizing an open viewer still releases its iframe stream and
  restoring it reconnects the viewer without replacing the remote session.
- [ ] [AC-UI-1] [UI] The minimized mobile directive exposes an accessible
  "Restore inline browser" control and fits the mobile viewport.

## Scope

- The `steel-browser` inline message directive.
- Mobile/compact client detection local to the plugin UI.
- Browser regression coverage for mobile and desktop initial behavior.
- Documentation of the mobile opt-in behavior.

## Non-goals

- Changing the standalone Steel Browser plugin page or thread panel.
- Changing browser provisioning, session creation, navigation, or BB Connect.
- Persisting the minimized choice between messages or browser reloads.
- Changing the desktop auto-connect behavior.

## Verification

- Steel Browser type, unit, distribution, and build checks.
- Browser regression at desktop and mobile viewport/pointer profiles, including
  initial iframe request counts and explicit mobile restoration.
- Workspace verification required by repository policy.

## Capability Deltas

See `deltas/steel-browser-viewer.md`.
