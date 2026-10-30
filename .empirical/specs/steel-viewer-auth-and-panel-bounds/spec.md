# Steel Viewer Auth And Panel Bounds

## Request

> Prepare an upstream pull request for the verified BB Surf same-origin viewer relay, preserving BB authentication, project isolation and existing profiles; also fix sidebar hover expansion at non-default UI zoom so the viewer stays within viewport bounds, leaves chat usable and retains the same iframe. Port only the relevant steel-browser source, regression tests, SDK compatibility changes and documentation; verify before publishing the PR requested by the user.

## Goal

Make the embedded BB Surf viewer usable without a second Connect OAuth login and keep its expanded right panel inside the viewport at non-default UI zoom and above ordinary chat chrome.

## Acceptance Criteria

- [ ] [AC-1] The embedded player and cast socket use the active BB app origin and its existing authentication, without an iframe OAuth redirect.
- [ ] [AC-2] The relay resolves a valid thread/project to its saved loopback Steel binding, never forwards BB cookies or authorization headers, never exposes CDP, and rejects foreign origins.
- [ ] [AC-3] Text and binary transport, bounded input, connection deadlines and disposal work without replacing browser profiles or changing engine policy.
- [ ] [AC-UI-1] The real player displays frames and supports mouse, keyboard, masked paste and copy. Existing desktop/mobile human-control behavior remains intact.
- [ ] [AC-UI-2] Composer and splitter chrome cannot cover or intercept the expanded viewer. Hover and explicit expansion fit the viewport at 100% and 125% UI zoom, preserve usable chat space on desktop, retain the same iframe and field contents, and respect leave, shrink, Escape and thread changes.
- [ ] [AC-4] Plugin type, unit and build checks pass with a matching declared BB/SDK pair. Repository-wide checks are run and any unrelated baseline failure is reported.

## Scope

The steel-browser plugin's viewer transport, panel geometry, affected tests, operational docs, package metadata and required workspace lockfile updates. Publish the verified changes as a fork pull request against upstream main.

## Non-goals

No website credential handling, profile migration, container replacement, public CDP exposure, disabled authentication, external-browser login workaround, unrelated plugin upgrade, or release/tag publication. Do not publish real-account screenshots or machine-specific backup notes.

## Risks

The relay must fail closed if Steel's player template changes. Browser API availability must match package engines. CSS zoom and fixed-position containing blocks can invalidate visual-coordinate assumptions; test the observed overflow before changing geometry. Existing upstream workflow reconciliation may touch unrelated journals; exclude those changes from the PR.

## Verification

- Focused HTTP/WebSocket tests, including invalid scopes/targets and lifecycle cleanup.
- Root-invoked steel-browser check and repository-wide npm check.
- Sequential browser checks in the dedicated project Steel session, using synthetic pages and fields.
- Regression reproduction at 125% zoom and bounded desktop/mobile screenshots with synthetic content.
- Actual installed relay: HTTP 200 for the BB app and HTTP/WebSocket 403 for a foreign Origin. The user has confirmed the viewer works in native BB.
- Review the complete PR diff for security, regressions and unintended files before push.
## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
