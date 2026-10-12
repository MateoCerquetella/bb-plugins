# UI/UX Specialist Advisory

Specialist: ui-ux

Verdict: advisory

## Findings

### Finding UI-1

- Severity: low
- Category: clarity
- Location: `mockups/index.html`, grouped root row
- Recommendation: Keep the project badge in the established leading identity
  position and the smaller provider glyph adjacent to family status. This makes
  their different meanings readable without increasing row height.

### Finding UI-2

- Severity: low
- Category: acceptance
- Location: `spec.md`, AC-2 and AC-3
- Recommendation: Verify the provider is rendered exactly once and the
  grouped-root badge uses the same configured color/initial as the project
  header; absence of overlap alone would not catch a missing or duplicated
  identity.

### Finding UI-3

- Severity: low
- Category: acceptance
- Location: `spec.md`, AC-4 and AC-5
- Recommendation: Name the leading project badge as the control replaced by
  selection mode and explicitly guard both identity positions in automated
  coverage.

## Summary

The revised mockup is the clearest minimal correction because it preserves the
existing scanning pattern and changes only icon ownership. The acceptance
criteria now cover both visible separation and identity consistency.
