# UI/UX Advisory

Specialist: ui-ux

Verdict: advisory

## Assessment

The single direction is the clearest interface for the stated criteria because
it preserves the existing compact native Steel viewer and changes only when it
is surfaced. Placing the viewer immediately before the handoff copy makes
"browser above" literally true and keeps sign-in context and action together.
Repeating the directive for later MFA/manual handoffs avoids relying on a stale
or scrolled-away viewer.

## Findings

- Severity: low
- Category: state-coverage
- Location: acceptance criteria AC-1 and AC-2
- Recommendation: Retain explicit coverage for every later sign-in, MFA,
  consent, or manual-action request, not only the first navigation response.

- Severity: low
- Category: visual-consistency
- Location: mockup direction 1
- Recommendation: Preserve the current Steel component, host-like density,
  small radii, semantic status color, minimize, and reload controls; do not add
  a second browser surface or explanatory card.

## Deliberately Ruled Out

An external viewer link, a right-panel-only handoff, a persistent second iframe,
and a redesigned sign-in surface are outside the fix and would weaken the
thread-local interaction model.
