# Browser Right Panel

## Request

> Improve the existing Steel Browser plugin: put the live agent browser viewer on the right side opened/closed by clicking a browser icon; dwelling the pointer over the browser panel for about two seconds expands it toward nearly full screen without a blocking modal, with a reversible return to compact view; mimic BB native UI styling, and replace Steel Browser user-facing branding with a personalized name (user preference pending; use configurable display name if needed). Preserve same project-bound browser session and ability to watch the agent work. Implement and verify the human UI and CLI.

## Goal

Watch the agent's existing project browser in a native-looking right panel, expand it after a deliberate two-second hover without a modal, and return to the conversation easily. Use Cerq Browser as the display name unless the user supplies another preference.

## Acceptance Criteria

- [ ] [AC-UI-1] [UI] The browser icon opens BB's right thread panel; each browser handoff also offers an accessible Open browser panel control. Inline viewing remains a fallback if BB cannot open a panel.
- [ ] [AC-UI-2] [UI] Hovering the panel for 2000ms on a fine-pointer desktop expands it to almost the viewport width, without a backdrop, focus trap, or disabling the remaining conversation. Leaving collapses a hover-expanded panel; Expand, Shrink and Escape offer explicit alternatives. Short hovers, unmount and blur cancel pending expansion.
- [ ] [AC-UI-3] [UI] Expanding/shrinking preserves the viewer iframe and project session. Thread changes clean up timers and expanded geometry. Mobile/touch uses explicit controls and stays within viewport bounds.
- [ ] [AC-UI-4] [UI] Browser surfaces use BB semantic theme tokens, compact native controls and visible keyboard focus in light and dark themes. User-facing plugin navigation and browser headings say Cerq Browser (or the user's selected name).
- [ ] [AC-5] Existing project isolation, CLI automation, authenticated viewer transport and human controls continue to work. Existing steel-browser IDs/commands/directives remain compatible.

## Scope

Existing plugins/steel-browser UI, browser handoff affordance, manifest display branding, bundled skill and README. Add interaction-focused browser verification.

## Non-goals

No BB host patch, new browser provisioning engine, protocol/CLI rename, cookie migration, credential handling changes, or publication.

## Risks

The host owns panel placement and available width. Expanded content must stay within viewport and preserve the iframe. Cross-origin iframe pointer events require testing over the iframe itself. A displayed name change must preserve existing installation and agent instructions.

## Verification

Run npm install and npm run check from workspace root. Use the current project's dedicated Steel CDP browser for hover timing, pointer cancellation, iframe persistence, keyboard/manual controls, small/touch layout and light/dark screenshots. Install/reload the local plugin and inspect its CLI and actual human panel. Independent code review precedes integration.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
