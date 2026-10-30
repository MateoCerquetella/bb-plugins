# Decisions

## D-001: Keep the embedded viewer on the active BB origin

Status: Accepted

### Evidence

GitHub OAuth denies embedding in the Connect iframe. The BB-origin relay has passed real transport and input checks; the user confirmed that the deployed viewer works in native BB.

### Options

- Keep the iframe OAuth flow, which GitHub blocks.
- Use external login or an unauthenticated viewer, outside the requested embedded, protected workflow.
- Relay the existing player and cast transport through authenticated BB plugin routes.

### Chosen approach

Use the BB-origin relay with saved project/thread binding resolution, loopback-only player/cast targets, no forwarded BB credentials and no CDP or arbitrary-URL access. Preserve the player, clipboard protocol, profiles, engine policy and Connect readiness. Declare the matching BB/SDK versions. Fail closed on an unsupported player template and bound connection/input resources.

### Trade-offs and risks

The relay relies on the known Steel player template. Direct public Connect viewer URLs retain separate authentication. Other plugins must not be upgraded as part of this repair.

### Verification

Check target binding, headers, foreign origins, text/binary transport and disposal; run real frames, mouse, keyboard, masked paste and copy checks, plus plugin/workspace checks. Publish no real-account screenshots.

## D-002: Undo CSS zoom when assigning measured panel geometry

Status: Accepted

### Evidence

At 125% zoom a 1440 by 900 fixture renders the old hover panel at x=230, y=75, width=1200, height=1040. Converting its visual coordinates back to layout units yields x=472, y=60, width=960, height=832.

### Options

- Remove the documented automatic hover interaction.
- Reparent the iframe and risk reconnecting it.
- Correct the axis-scale conversion in the existing expansion hook.

### Chosen approach

Divide computed top, right, width and height by visual/layout scale measured from the anchor's DOMRect and offset dimensions. Preserve hover, pin, leave, shrink, Escape and iframe identity. Test actual unobscured chat space rather than the unchanged underlying element width.

### Trade-offs and risks

A shared live browser can resize while tests run, so bounds assertions use the current viewport. Keep unrelated Empirical reconciliation, machine-local reports and generated files out of the upstream PR.

### Verification

Run sequential panel tests at 100% and 125% zoom, desktop/mobile and both themes. Check bounds, field contents, iframe identity and unchanged stream load counts. Submit one upstream bug-fix PR as requested.

## D-003: Promote the retained viewer above ordinary pane chrome

Status: Accepted

### Evidence

The user identifies the composer and chat/sidebar splitter covering the expanded viewer. The documented two-second expansion itself is intended. A section z-index cannot escape a parent stacking context.

### Options

- Increase the section z-index, which remains confined by its pane.
- Reparent the iframe, risking loss of viewer state.
- Show the existing section as a manual popover in the browser top layer.

### Chosen approach

Use the non-modal manual Popover API on the same section while expanded. Reset its native margins/insets, preserve the zoom bounds and existing hover/pin controls, and keep the uncovered chat interactive.

### Trade-offs and risks

Requires Popover API support in supported BB webviews. A later modal clipboard dialog must retain its own top-layer priority. No portal or iframe remount is needed.

### Verification

Add an isolated pane plus high-layer composer/splitter fixture. Before the change, hit testing reports the obstructing chrome; afterwards the same coordinates reach the viewer in hover and pinned modes. Assert iframe identity, load count, field state, usable chat and shrink/leave/Escape behavior at normal and 125% zoom.
