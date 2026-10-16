# UI/UX consult

- Specialist: ui-ux
- Verdict: advisory
- Host metadata: keep machine identity beside the branch, with bounded
  truncation and full titles. Do not infer a host when BB supplies none.
- Finding: Keep project choices in the existing filter menu and render the
  active project name in the trigger and accessible label. This matches the
  supplied Cursor-style reference without adding a second control or changing
  the grouped sidebar hierarchy.
  - Severity: low
  - Category: clarity
  - Location: workspace filter trigger and project menu
  - Recommendation: Preserve the compact menu and make All the explicit
    restore action.

The contract covers the essential interaction: project choices come from
visible active groups, selecting a project preserves its group ordering and
hierarchy, All restores the complete list, and the trigger exposes the active
selection accessibly. No additional UI requirement is needed for this scope.
