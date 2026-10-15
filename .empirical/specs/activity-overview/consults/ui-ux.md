# UI/UX Consult

- Specialist: UI/UX
- Verdict: advisory
- Finding: Settings and thread actions do not satisfy the requested New Thread
  placement.
  - Severity: high
  - Category: usability
  - Location: `spec.md#acceptance-criteria`
  - Recommendation: Render the existing dashboard through the homepage section
    below the composer; preserve other entry points and test slot registration.
- Finding: The single dense dashboard direction makes the four metrics,
  heatmap, patterns, and attention queue scannable while preserving BB's
  compact operational tone.
  - Severity: medium
  - Category: usability
  - Location: `mockups/index.html`
  - Recommendation: Keep the two-column desktop layout, collapse it at a
    narrow breakpoint, and retain labels and focus treatment in the production
    implementation.
- Finding: The mockup uses reference styling rather than importing host CSS.
  - Severity: low
  - Category: visual consistency
  - Location: `mockups/index.html`
  - Recommendation: Map production colors and spacing to BB theme tokens.
