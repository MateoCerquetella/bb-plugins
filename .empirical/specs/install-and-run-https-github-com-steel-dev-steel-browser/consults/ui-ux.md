# UI/UX Advisory

Specialist: ui-ux
Verdict: advisory

- Severity: medium
  Category: correctness
  Location: inline browser project identity
  Recommendation: Show project name beside connection state and fail closed
  when no project binding exists. Never render the legacy global viewer.
- Severity: medium
  Category: interaction
  Location: Tools engine selector
  Recommendation: Use a select and a distinct fallback checkbox; show
  unavailable Jev state without implying readiness from saved paths alone. If
  Tools has no project context, replace the controls with a concise explanatory
  state and keep host-side Jev configuration visible.
- Severity: low
  Category: accessibility
  Location: inline browser toolbar
  Recommendation: Retain named icon controls, keyboard focus and minimum
  touch targets; cap width at 560px and keep minimized iframe unfocusable.

Focused pass by the implementing agent; not an independent review.
