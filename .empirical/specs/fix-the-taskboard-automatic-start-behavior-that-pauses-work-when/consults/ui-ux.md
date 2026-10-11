# UI/UX Advisory

- Specialist: ui-ux
- Verdict: advisory

## Findings

### UIUX-1
- Severity: high
- Category: readability
- Location: agent progress current and earlier run hierarchy
- Finding: The implemented screen repeats the run kind and status at nested
  levels, gives every disclosure equal visual weight, and uses separators as
  the primary structure. This makes current work difficult to distinguish from
  historical evidence.
- Recommendation: Use one current-work heading with a compact status mark and
  activity sentence. Move prior runs into dense one-line summaries and reveal
  full run evidence only after selection.

### UIUX-2
- Severity: high
- Category: functionality
- Location: Changed files disclosure
- Finding: A path list does not satisfy the user's expectation of a real diff
  and offers no evidence of what the agent changed.
- Recommendation: Resolve patches from the managed environment at view time,
  provide file selection, and render the selected patch with BB's host-owned
  unified diff component. Show honest loading, empty and unavailable states.

### UIUX-3
- Severity: medium
- Category: motion
- Location: live activity affordance
- Finding: Static content does not communicate that the agent is actively
  working, while broad pulsing or animated containers would reduce legibility.
- Recommendation: Animate only a small status glyph and update arrival, using
  the established Dockside timing patterns. Stop animation outside live states
  and disable it under `prefers-reduced-motion`.

### UIUX-4
- Severity: medium
- Category: density
- Location: commands, updates and stage result
- Finding: Persistent latest-command text and an open updates section compete
  with the primary activity even when the user has not requested raw evidence.
- Recommendation: Keep command and update evidence collapsed by default, expose
  outcome counts in their summaries, and retain the current activity sentence
  as the only always-visible raw work detail.
