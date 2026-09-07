# Security Advisory

Specialist: security

Verdict: advisory

## Findings

### Finding 1
- Severity: high
- Category: information disclosure
- Location: Save My Model RPC and frontend error handling
- Recommendation: Never return raw host/provider exception text because it may
  contain executable paths, usernames, or local configuration details. Return
  fixed bounded messages for host-list, enrollment, and catalog failures.
- Resolution: Implemented fixed messages on both RPC and frontend transport
  boundaries.

### Finding 2
- Severity: medium
- Category: authorization and routing
- Location: `resolveSelection` RPC
- Recommendation: Verify the requested host through `bb.sdk.hosts.get` before
  routing provider discovery. Reject missing or identity-mismatched hosts and do
  not invoke `system.executionOptions` for them.
- Resolution: Implemented and covered by a no-dispatch regression test.

### Finding 3
- Severity: medium
- Category: untrusted persistence
- Location: browser localStorage preferences
- Recommendation: Continue treating every stored field as untrusted. Bound
  host/provider/model lengths, reject controls and unknown reasoning values,
  cap listing work, and reconcile only against a successful live BB catalog.
- Resolution: Existing validation remains active and now accepts BB's current
  `ultracode` reasoning value.

### Finding 4
- Severity: medium
- Category: UI integrity
- Location: Action Topbar overlay
- Recommendation: Keep the plugin overlay beneath BB-owned approval/dialog
  tiers so it cannot visually obscure a security decision. Do not use the
  browser top layer or an unbounded maximum z-index.
- Resolution: The body-mounted launcher and drag overlays use tiers 40/41,
  above ordinary panes and below host portals beginning at 50.

### Finding 5
- Severity: low
- Category: release integrity
- Location: Git tags and marketplace source ranges
- Recommendation: Resolve only immutable plugin-prefixed tags, verify manifest
  versions and commits before publication, and never move the existing Host
  Monitor v0.1.5 tag.
- Resolution: Release and marketplace commands remain behind separate exact
  approval; Host Monitor's tag is unchanged.
