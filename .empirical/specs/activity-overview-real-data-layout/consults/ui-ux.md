# UI/UX advisory

- Specialist: ui-ux
- Verdict: advisory
- Question: Does this mockup show the clearest interface for the stated criteria,
  and what does it reveal that the criteria are still missing?
- Context: spec.md and mockups/ only, followed by a focused browser pass on
  the mockup in this project's Steel session.

## Assessment

The single direction expresses the requested hierarchy: a centered composer
above an optional, aligned overview. Compact typography, native semantic
colors, inline metrics and simple pattern rows match the design-language intent
recorded in mockups/README.md. Deliberately ruled out: another plugin, a second
composer, oversized overview headings, nested dashboard cards and invented
activity. The original instruction to implement establishes scope, but the
newly authored direction still awaits the user's explicit mockup choice.

## Findings

### UX-1
- Severity: medium
- Category: layout
- Location: mockups/compact.html, .activity-body > section
- Finding: The mobile grid item's intrinsic calendar width originally escaped
  its scroll region and widened the page.
- Recommendation: Set min-width:0 on its section and keep the calendar inside
  the labeled keyboard-focusable scroll region.
- Resolution: Applied and rechecked at 390px; document/body overflow checks
  pass and the composer and overview share the horizontal center.

### UX-2
- Severity: low
- Category: state-coverage
- Location: mockups/compact.html, preview state controls; spec.md
- Finding: A shared unavailable message did not demonstrate separate loading
  and request-failure presentations.
- Recommendation: Demonstrate loading, empty, unavailable and error separately,
  hide unconfirmed metrics, and show retry only where appropriate.
- Resolution: Added explicit Loading and Error previews. The contract requires
  distinct source states and request-race protection in the implementation.

### UX-3
- Severity: low
- Category: interaction
- Location: mockups/compact.html, period/repository controls; spec.md
- Finding: Only the 365-day authenticated snapshot is available in this layout
  preview; repository-scoped and other-period responses are not demonstrated.
- Recommendation: Keep the scope limitation explicit and require real queries
  for implemented controls. Never scale the captured counts or reuse global
  contribution dates under a repository label.
- Resolution: The mockup labels its repository choice as a scope preview and
  shows unavailable for it. The contract covers real periods, supported source
  scopes, pagination and incomplete metrics. No fabricated counts are used.

## Browser evidence

Captured in `/home/dyaus/.bb/thread-storage/thr_pzjrmu9rix/aura-mockup/`:
desktop.png, mobile.png, mobile-light.png and checks.json. Tests exercise
centering/alignment, narrow overflow, overview off/on, unavailable hiding
unconfirmed metrics, retry returning to the actual snapshot, and light theme.
These verify the reference mockup only, not implemented AURA acceptance criteria.

No blocking design findings remain. User approval of the direction is pending.
