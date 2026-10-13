# UI/UX Advisory: Thread Mobile

- Specialist: ui-ux (focused primary-agent pass)
- Verdict: advisory
- Scope: feature specification and mockups/index.html only

## Findings

- Severity: low
- Category: accessibility
- Location: mockups/index.html, navigation strip
- Recommendation: Keep 44px controls, position announcements, full accessible
  arrow labels and a single-line truncated title. Native plugin implementation
  should use the repository icon library; this layout-only mockup uses text
  arrows without importing external assets.

- Severity: low
- Category: interaction
- Location: specification AC-UI-2 and swipe title
- Recommendation: Limit swipe to the strip and lock out vertical movement once
  detected. Avoid edge gestures and any mutation such as archive on swipe.

- Severity: low
- Category: state-coverage
- Location: navigation strip title metadata
- Recommendation: Put the live thread status beside the numeric position on
  the secondary line. Use BB's accessible indicator label verbatim and a
  neutral "Idle" fallback; do not add a second badge or infer completion.

## Assessment

The one proposed direction follows the repository's compact, native,
operational design language. The title strip is reachable near the composer,
does not occupy the conversation, and has explicit alternatives to gestures.
Desktop hides the controls. Styling is reference, not imported host tokens.
The user's standing approval covers the compact-strip direction. The status
addition preserves that direction and does not introduce another interaction.
