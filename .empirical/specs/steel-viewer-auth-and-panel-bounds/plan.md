# Implementation plan

1. Port the user-verified same-origin relay, scoped URL construction, SDK-compatible panel calls and operational guidance from the standalone repair. Keep local backups, reports and account screenshots out of the repository.
2. Add the measured axis-scale correction to the existing panel hook. Promote the same section with a manual popover while expanded to escape host stacking contexts. Extend the panel browser fixture with an isolated sidebar, higher composer and splitter layers, hit-testing assertions, 125% CSS zoom and assertions for actual viewport bounds, unobscured chat, retained iframe and input state. Preserve documented hover and explicit controls.
3. Hide the inner viewer size/reconnect pair only in the sidebar. Assert exactly one visible size/reconnect pair while preserving clipboard controls and existing standalone viewer behavior.
4. Update only the steel-browser package's required BB/SDK/tooling metadata and workspace lockfile. Install and run focused checks from the workspace root. Run repository-wide checks with the CI-supported Node version and report any unrelated baseline failure.
5. Run sequential live relay, human-control and panel browser checks against the dedicated project Steel session using synthetic content. Verify HTTP/WebSocket foreign-origin rejection. Retain bounded synthetic screenshots where useful.
6. Review the source-only diff for security, lifecycle, UI behavior and package correctness. Refresh the relevant capability/context evidence, exclude unrelated workflow reconciliation and produce immutable verification receipts where supported.
7. Commit the scoped fix on its feature branch, push to the authenticated user's fork and open an upstream pull request with the observed failures, corrected behavior, exact verification and minimum-version implications. Do not merge or publish a release.

## Affected tests

- plugins/steel-browser/test/human-control.test.ts
- plugins/steel-browser/test/viewer-relay.test.ts
- plugins/steel-browser/test/distribution.test.ts
- plugins/steel-browser/test/human-control.browser.mjs
- plugins/steel-browser/test/panel.browser.mjs
- plugins/steel-browser/test/inline.browser.mjs
- plugins/steel-browser/test/viewer-relay.browser.mjs

## Verification commands

- npm run check --workspace bb-plugin-steel-browser
- npm run check
- STEEL_CDP_URL=<project-CDP> node plugins/steel-browser/test/human-control.browser.mjs
- STEEL_CDP_URL=<project-CDP> node plugins/steel-browser/test/panel.browser.mjs
- STEEL_CDP_URL=<project-CDP> BB_VIEWER_BASE_URL=<BB-origin> BB_THREAD_ID=<thread> node plugins/steel-browser/test/viewer-relay.browser.mjs
