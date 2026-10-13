# Implementation Plan

1. Add `plugins/thread-glide` package, MIT license, manifest, README, icon,
   app entrypoint, CSS, pure navigation/gesture helpers and tests.
2. Extend the existing bare composer banner using `useComposer` and the live
   sidebar projection. Add status metadata using host indicator labels,
   preserve navigation and gestures, and test idle/unknown/unavailable cases.
3. Add the plugin to `.bb/plugins.json` and validate workspace metadata.
4. Run focused tests, typecheck and plugin build; install/reload locally.
5. Exercise mobile arrows, accepted/rejected swipes, boundaries, draft
   preservation and desktop hiding in Steel; then run root checks and review.
