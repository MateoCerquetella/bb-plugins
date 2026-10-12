# Design

## Components
- Shared LiveViewer owns iframe, expanded layout and transient clipboard UI.
- Safe viewer URL helper pins the configured authenticated origin and retains
  an upstream session path only under /v1/sessions/.
- Clipboard bridge checks origin, source and message shape; no passive read
  requests are accepted. Copy responses need a short-lived user-created lease.
- Inline lifecycle observes latest directive and document visibility, and
  removes iframes when inactive, hidden or minimized.
- Account records store only service enum, user label and confirmation time
  under project-scoped KV keys. They do not read credentials or cookies.
- Allowlisted service navigation uses the existing persistent context and
  opens a new page. Login is always completed by the user.

## UI
Compact project/engine controls, one large viewer with Copy/Paste/Expand and
connection toggle, a flat Saved sign-ins section, and compact sessions list.
Expanded control keeps the iframe mounted in place, using fixed positioning.
The inline viewer uses the same controls without the page-level account list.

## Verification
Test URL pinning, hostile messages, clipboard leases, account project isolation,
label validation and navigation catalog. Browser checks use dummy values and
mock RPC in the same Steel session. Do not navigate or read existing account
tabs. Run plugin and workspace checks before pushing.
