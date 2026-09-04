# Decisions: Host Monitor Two-Stage Modal Page

## D-001: Recover the old pattern, not the old feature set

Status: Accepted

### Evidence

- The prior Host Monitor registered a footer action, content script, and nav
  panel, but its modal module also included alerts, IP/process features,
  draggable floating state, and extensive unrelated policy.
- The current fleet RPC already provides every safe value the compact modal
  needs.

### Options

1. Restore the prior module wholesale.
2. Keep navigating directly to Settings.
3. Rebuild the prior two-stage pattern as a small fleet-only modal.

### Chosen approach

Choose option 3. Recover the familiar interaction while keeping the current
privacy, notification, transport, and dashboard boundaries.

### Trade-offs and risks

The modal has fewer diagnostics than the old implementation, but exposes the
requested CPU/RAM/disk overview and hands advanced use to the full page.

### Verification

Source-absence tests, bounded parser tests, live modal browser checks, and
isolated review.

## D-002: Restore the public nav panel for the dedicated page

Status: Accepted

### Evidence

- `navPanel` is the public SDK route for a dedicated plugin page.
- The footer action context only opens Settings, which the user explicitly
  rejected; a content script can navigate to the registered route.
- The SDK has no hidden nav-panel route.

### Options

1. Keep the dashboard in Settings.
2. Build a full-page DOM overlay.
3. Restore `navPanel` and navigate from the mini-modal.

### Chosen approach

Choose option 3, matching the old two-stage implementation and native BB page
behavior.

### Trade-offs and risks

BB also renders its normal Host Monitor nav row. This is the supported cost of
having a real dedicated page rather than another overlay or Settings.

### Verification

Registration tests and browser URL/page assertions.

## D-003: Poll only while the mini-modal is visible

Status: Accepted

### Evidence

- The backend already samples and caches every host every ten seconds.
- Content scripts do not receive `useRealtime`; extra continuous polling would
  duplicate work while the modal is closed.

### Options

1. Poll continuously.
2. Add another transport.
3. Fetch immediately and every ten seconds only while open.

### Chosen approach

Choose option 3 with request coalescing and abort-on-close.

### Trade-offs and risks

An open modal may lag a realtime change by at most the bounded interval.

### Verification

Unit-test the interval/coalescing helpers and observe live refresh behavior.
