# UI/UX Advisory

- Specialist: UI/UX
- Verdict: advisory

## Findings

- Severity: medium
  Category: consistency
  Location: mobile navigation project badge
  Recommendation: Source the badge presentation from Dockside's existing
    project color helper and live override hook so settings and navigation
    cannot drift.
- Severity: low
  Category: density
  Location: compact title row
  Recommendation: Keep the 18px project initial inline with the title and do
    not add a project-name row; expose the full project name as accessible text.
- Severity: low
  Category: motion
  Location: status glyphs
  Recommendation: Reuse Dockside's working, attention and arrival timings and
    honor `prefers-reduced-motion`.

The approved 44px-arrow strip remains the clearest mobile layout. The revised
criteria now cover the previously missing cross-project project context,
effective custom color synchronization, and ownership by Dockside.
