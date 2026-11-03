# Security advisory

- Specialist: security
- Verdict: advisory
- Question: How does this change get exploited, and what is the smallest fix
  that closes it?
- Context: spec.md, design.md and the capability delta, plus the exact
  `plugins/aura/lib/background.ts` diff reviewed at a3959c592.

## Assessment

The change is a static CSS block plus test, documentation and version edits.
It adds no network request, storage key, RPC method, executable code path,
HTML interpolation or user-controlled value. The only DOM it touches is BB's
own New thread recents element, selected by the stable
`data-root-compose-mobile-recents` attribute and structural children; it
applies presentational properties (margin, border, radius, background, shadow,
backdrop-filter, border-top, background-color) and hides the host's decorative
overflow-fade element.

There is no injection, authentication, authorization, secret or untrusted-input
surface introduced. The CSS cannot read data: `color-mix()` derives colors only
from existing theme tokens, and `backdrop-filter` samples rendering, not site
content. A malicious page cannot reach this injected style because the content
script runs only in the BB application origin.

## Findings

None. No exploitable path was identified.

## Recommendation

Keep the CSS static and theme-token based. If this ever starts interpolating
image URLs, user strings or remote values into the stylesheet, re-review it as
an injection surface.
