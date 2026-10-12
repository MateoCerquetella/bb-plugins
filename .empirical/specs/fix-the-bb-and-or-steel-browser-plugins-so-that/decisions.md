# Decisions

## D-001: Fix instruction emission, not BB directive rendering

Status: Accepted

### Evidence

`plugins/steel-browser/app.tsx` already registers the `steel-browser` message
directive and mounts `SteelBrowserDirective`. The screenshot's assistant
message contains no visible `::steel-browser{}` directive.

### Options

- Change BB's generic directive parser.
- Add a second automatic viewer surface.
- Make Steel's handoff instruction unambiguous.

### Chosen approach

Make the server instruction and bundled skill require the directive in the same
handoff response.

### Trade-offs and risks

This relies on model adherence, but avoids changing shared BB rendering and
preserves authentication and session boundaries.

### Verification

Distribution tests assert the same-message rule in both instruction surfaces.

## D-002: Preserve the existing viewer

Status: Accepted

### Evidence

Focused inline browser tests already cover desktop/mobile layout, iframe
lifecycle, minimizing, reconnecting, and thread following.

### Options

- Change the existing directive component or CSS.
- Keep the viewer unchanged and fix only when the directive is emitted.

### Chosen approach

Make no component or CSS changes.

### Trade-offs and risks

The fix does not repair a BB Connect outage; it ensures the viewer is requested
and rendered whenever the directive is present.

### Verification

Retain the existing inline browser test as the UI regression check and run
plugin build/type checks.
