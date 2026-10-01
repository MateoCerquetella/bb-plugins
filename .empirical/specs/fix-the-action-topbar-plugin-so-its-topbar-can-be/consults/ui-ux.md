# UI/UX Consult

- specialist: ui-ux
- verdict: advisory

## Assessment

The revised mockup clearly communicates the intended stacking hierarchy and
interaction lifecycle without redesigning the existing Action Topbar. The
previously blocking overlap gap is resolved: the launcher overlaps the
high-stacking right sidebar, while the drop overlay spans that same region and
the drag ghost follows the pointer with explicitly higher stacking levels.

The previously blocking pointer-evidence gap is also resolved. Tab and Action
rows now capture the pointer on press, apply a seven-pixel drag threshold,
display feedback only after engagement, and clear feedback and release capture
on pointer release, pointer cancellation, or explicit cancellation. The
topbar tab buttons also visibly declare `touch-action: none`, and the live
status makes each lifecycle state inspectable. The user-approved direction is
therefore sufficient to proceed.

## Findings

### UX-1

- severity: low
- category: verification-boundary
- location: `mockups/index.html` (Action-row `pointerdown` handler and live status)
- recommendation: Treat the “Host-owned Action split drag started” status as
  mockup evidence of the intended UX only. Verify the actual BB host API
  invocation through the specified contract test and local plugin exercise,
  because the standalone mockup cannot prove the production integration behind
  AC-3.

### UX-2

- severity: low
- category: responsive-evidence
- location: `mockups/index.html` (`@media (max-width: 720px)`)
- recommendation: During browser verification, capture one narrow-screen
  viewport in addition to the required desktop overlap evidence. The responsive
  geometry now supports the same stacking demonstration, and a capture will
  confirm that the full-width drop overlay and constrained launcher remain
  legible at the minimum supported width.

## Criteria Coverage

- AC-1: demonstrated by pointer capture, movement threshold, and pointer-driven
  drag feedback.
- AC-2: demonstrated by release, browser cancellation, and explicit
  cancellation cleanup paths.
- AC-3: represented clearly in the interaction mockup; production API
  invocation remains a contract-test concern.
- AC-UI-1: demonstrated by the launcher overlapping and stacking above the
  right sidebar.
- AC-UI-2: demonstrated by the overlay crossing the launcher/sidebar region and
  the pointer-following ghost stacking above both.
- AC-UI-3: demonstrated by the tab-button touch suppression and visible status
  text.
