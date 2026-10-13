# Implementation Plan

1. Add a pure compact/coarse-pointer detection helper in the Steel Browser app
   and use it as the inline directive's initial minimized state.
2. Update the inline browser regression to model desktop and mobile device
   profiles, asserting desktop automatic load and mobile zero-load initialization
   followed by explicit restore.
3. Document that inline directives are opt-in on mobile and automatic on desktop.
4. Run focused Steel checks and the real browser regression with screenshots.
5. Complete independent review and repository verification, commit only the
   feature files, open a pull request, observe required checks, and merge.
