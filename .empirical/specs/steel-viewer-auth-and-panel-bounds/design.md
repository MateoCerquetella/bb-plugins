# Viewer authentication and panel bounds

## Evidence

The public Connect viewer iframe redirects through getbb.app to GitHub OAuth. A live Chromium run observed GitHub's `X-Frame-Options: deny` and `frame-ancestors 'none'`, explaining the blank iframe. A local same-origin relay has passed transport and human-control tests and the user has confirmed it works in native BB.

The existing panel test at CSS zoom 1.25 reproduces the reported overflow: in a 1440 by 900 viewport, hover expansion renders at x=230, y=75, width=1200, height=1040. The hook measures already-zoomed DOMRects and applies those values as CSS lengths, scaling them again.

The user clarified that the remaining defect is the composer and pane splitter painting over the intended hover expansion. A pane stacking context prevents the section's z-index from ordering it above those siblings.

## Design

Register an exact local-auth GET route for the existing Steel player and an exact local-auth WebSocket route for its cast transport. Resolve the request's thread/project with the existing SDK and ProjectBrowsers storage. Fetch only the saved loopback API's player without forwarding incoming credentials or following redirects. Rewrite the player's one cast base URL to the BB-origin WebSocket route. Validate template shape, scope, page IDs, pending input size and connection lifetime. Dispose upstream connections on socket closure or plugin disposal.

All embedded UI entry points build the player URL from the current app origin and their existing scope. Preserve the upstream player, clipboard protocol, project profiles, Connect readiness and CLI behavior. Use the installed BB/SDK API pair and migrate retired panel registration/open calls mechanically.

For expansion, calculate the anchor's visual-to-layout scale independently for each axis using its DOMRect and offset dimensions. Divide computed top, right, width and height by that scale before assigning fixed-position CSS properties. Promote the existing section to the browser top layer using a manual popover while expanded; reset native popover margins and insets. This escapes pane stacking contexts without moving or remounting the iframe, and keeps the chat interactive. Keep the current hover/pinned state machine and iframe node. Strengthen the browser test to check unobscured chat space, not the unchanged underlying chat element width.

## Verification and failure behavior

Focused tests cover relay target binding, headers, foreign origins, unknown projects, malformed page IDs, input limits, binary/text messages and disposal. Browser checks exercise real frames and human input, then panel hover/pin behavior at normal and 125% zoom, desktop/mobile and both themes. Scope unavailable/template mismatch produces a bounded unavailable response; no public or external-browser fallback is introduced.

Run plugin and repository checks from the workspace root. Publish source, tests, required dependency metadata and the scoped capability delta only. Keep generated builds, original backups, machine-specific reports, real-account screenshots and unrelated Empirical reconciliation changes out of the PR.
