# UI/UX consult

- Specialist: ui-ux
- Verdict: advisory
- Evidence: AC-UI-6 adds a client-controlled opening action to the existing browser surfaces. No new mockup is required for the compact link added beside the current viewer controls; the existing screenshot artifacts show those toolbars.
- Finding: The login handoff must be visible before the iframe authenticates and while a handoff is minimized.
  - Severity: medium
  - Category: usability
  - Location: spec.md#AC-UI-6
  - Recommendation: Put Open in your browser in the panel/inline header and plugin viewer toolbar rather than behind clipboard readiness or Take control.
- Finding: A viewer tab on the Mac and a website session inside the remote browser are distinct.
  - Severity: medium
  - Category: usability
  - Location: spec.md#goal
  - Recommendation: Explain that the tab opens the same project browser and BB Connect sign-in uses the user's client; do not imply Safari cookies or password-manager autofill are imported.
