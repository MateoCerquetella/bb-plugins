# Decisions: Host Monitor Native Modal Navigation Fixes

## D-001: Activate BB's hidden semantic nav row

Status: Accepted

### Evidence

- BB renders the Host Monitor route owner as
  `data-sidebar-navigation-item="host-monitor/host-monitor"`.
- Its button already performs the correct client-side navigation.
- Direct `location.assign` reloads BB; the SDK exposes no hidden nav-panel flag.

### Options

1. Keep hard navigation.
2. Reimplement BB history routing.
3. Hide the exact row and activate its native button programmatically.

### Chosen approach

Choose option 3 to reuse BB's router and preserve the current document.

### Trade-offs and risks

This relies on a semantic host data attribute, so cleanup and browser
verification protect against markup changes.

### Verification

Assert exact selector use, no hard navigation, and stable browser document ID.

## D-002: Restore sidebar state instead of deleting the row

Status: Accepted

### Evidence

- The hidden row must remain available for native navigation.
- Content-script generations are replaced on plugin reload.

### Options

1. Remove the row.
2. Inject global CSS.
3. Preserve and toggle each exact wrapper's `hidden` property.

### Chosen approach

Choose option 3 with a remount observer and exact disposal restoration.

### Trade-offs and risks

The row remains in DOM but not visible or keyboard reachable while hidden.

### Verification

Test state preservation and inspect one visible footer action/zero visible rows.

## D-003: Treat thresholds as passive guides

Status: Accepted

### Evidence

- The fleet RPC already includes configured CPU/RAM/disk guides.
- The user asked for CPU/RAM thresholds but still rejects notifications.

### Options

1. Add alerts/badges.
2. Add passive visual and accessible guide wording.
3. Add new modal-only settings.

### Chosen approach

Choose option 2, reusing existing CPU/RAM settings and semantic theme colors.

### Trade-offs and risks

Guides are visible only while the modal is open and cause no notification.

### Verification

Test boundary values, invalid fallback, accessible labels, and live rendering.
