# Decisions

## D-001: Adapt the reference as a coherent implementation

Status: Accepted

### Evidence

- The reference repository at commit
  `7a28e61f1816499cf6b9c6faca4a1f7ab4662e18` couples its UI to bounded local
  history, directory sampling, memory diagnostics, and SQLite storage.
### Options

1. Restyle the fleet UI only.
2. Layer charts onto the fleet architecture.
3. Adapt the coherent local monitor.

### Chosen approach

Choose option 3 and retain Host Monitor identity.

### Trade-offs and risks

Fleet and destructive process-control features are removed, matching
  the user's request for the referenced experience and substantially reducing
  privileged surface area.

### Verification

Use focused behavior tests, package inspection, local install, and
  browser inspection.

## D-002: Remove notification surfaces while retaining passive warnings

Status: Accepted

### Evidence

- The old app imports Sonner and renders resource alert banners; the
  reference also registers a sidebar warning dot.

### Options

1. Hide old notifications with settings.
2. Keep the upstream warning dot.
3. Remove all notification delivery/accessories.

### Chosen approach

Choose option 3: omit all toast, browser/desktop notification, alert-banner, and sidebar
  warning accessory behavior. Keep inline collector status and passive threshold
  coloring/chart guides because they are telemetry, not notification delivery.

### Trade-offs and risks

Operators must open the panel to see warning state.

### Verification

Use a source regression search/test plus browser inspection.

## D-003: Keep process attribution opt-in and read-only

Status: Accepted

### Evidence

- The reference bounds collection and disables identifying process
  details by default; the existing plugin offers destructive process controls.

### Options

1. Retain controls.
2. Show process details by default.
3. Use upstream privacy behavior.

### Chosen approach

Choose option 3: use upstream opt-in, bounded, read-only diagnostics and delete process
  termination RPCs/UI.

### Trade-offs and risks

Remediation happens outside Host Monitor.

### Verification

Use monitor/server tests and RPC contract inspection.

## D-004: Preserve abandoned records recoverably

Status: Accepted

### Evidence

- Two unrelated waiting Empirical records prevented new work, and the
  user explicitly authorized abandoning both.

### Options

1. Delete them.
2. Falsely complete them.
3. Preserve them outside active specs.

### Chosen approach

Choose option 3: move both complete record directories to `.empirical/abandoned/` so
  they no longer claim the checkout and remain recoverable.

### Trade-offs and risks

The feature diff records their relocation.

### Verification

Empirical selected this new feature after relocation.
