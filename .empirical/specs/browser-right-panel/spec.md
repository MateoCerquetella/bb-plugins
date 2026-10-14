# Browser Right Panel

## Request

> Improve the existing Steel Browser plugin: put the live agent browser viewer on the right side opened/closed by clicking a browser icon; dwelling the pointer over the browser panel for about two seconds expands it toward nearly full screen without a blocking modal, with a reversible return to compact view; mimic BB native UI styling, and replace Steel Browser user-facing branding with a personalized name (user preference pending; use configurable display name if needed). Preserve same project-bound browser session and ability to watch the agent work. Implement and verify the human UI and CLI.

## Goal

Watch the agent's existing project browser in a native-looking right panel, expand it after a deliberate two-second hover without a modal, and return to the conversation easily. Use Cerq Browser as the display name unless the user supplies another preference.

The user additionally requests Kernel's easier login pattern: a visible, user-clicked action opens the live viewer in a new tab on the client they are using (their Mac). Kernel's BB plugin uses ordinary new-tab links for its live viewer and hosted login card. Cerq Browser will offer the same opening affordance for its existing project viewer, including before the embedded viewer finishes authentication. This does not provide Kernel Managed Auth or import Safari/Chrome cookies.

## Acceptance Criteria

- [ ] [AC-UI-1] [UI] The browser icon opens BB's right thread panel; each browser handoff also offers an accessible Open browser panel control. Inline viewing remains a fallback if BB cannot open a panel.
- [ ] [AC-UI-2] [UI] Hovering the panel for 2000ms on a fine-pointer desktop expands it to almost the viewport width, without a backdrop, focus trap, or disabling the remaining conversation. Leaving collapses a hover-expanded panel; Expand, Shrink and Escape offer explicit alternatives. Short hovers, unmount and blur cancel pending expansion.
- [ ] [AC-UI-3] [UI] Expanding/shrinking preserves the viewer iframe and project session. Thread changes clean up timers and expanded geometry. Mobile/touch uses explicit controls and stays within viewport bounds.
- [ ] [AC-UI-4] [UI] Browser surfaces use BB semantic theme tokens, compact native controls and visible keyboard focus in light and dark themes. User-facing plugin navigation and browser headings say Cerq Browser (or the user's selected name).
- [ ] [AC-5] Existing project isolation, CLI automation, authenticated viewer transport and human controls continue to work. Existing steel-browser IDs/commands/directives remain compatible.
- [ ] [AC-UI-6] [UI] The right panel, inline handoff (including minimized mode) and plugin page expose an accessible Open in your browser link once a valid project viewer is available. It opens that same HTTPS project viewer only on a user's activation, in a new client tab with noopener/noreferrer. It stays usable before viewer readiness and does not stop, recreate or switch the agent session. A short explanation distinguishes BB Connect sign-in on the user's client from website login in the remote project browser. User activation and same-session URLs are verified in a browser fixture.

## Scope

Existing plugins/steel-browser UI, browser handoff affordance, manifest display branding, bundled skill and README. Add interaction-focused browser verification.

## Non-goals

No BB host patch, new browser provisioning engine, protocol/CLI rename, cookie migration, credential handling changes, or publication.

No Kernel installation, hosted managed-auth service, automatic OS browser launch, copying local cookies, or claim that a top-level viewer signs the agent into a website automatically. Agents continue in the dedicated project browser; the new action is controlled by the human on their own client.

## Risks

The host owns panel placement and available width. Expanded content must stay within viewport and preserve the iframe. Cross-origin iframe pointer events require testing over the iframe itself. A displayed name change must preserve existing installation and agent instructions.

An arbitrary dashboard URL must not become an external navigation destination. Reuse the authenticated HTTPS viewer URL validation and same-session path. A new tab belongs to the user's client, not a shell command on the agent host. Safari password-manager autofill into a remote video viewer is not implied.

## Verification

Run npm install and npm run check from workspace root. Use the current project's dedicated Steel CDP browser for hover timing, pointer cancellation, iframe persistence, keyboard/manual controls, small/touch layout and light/dark screenshots. Install/reload the local plugin and inspect its CLI and actual human panel. Independent code review precedes integration.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
