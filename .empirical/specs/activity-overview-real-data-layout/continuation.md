# Continuation from thr_7khqwk8ydq

## Current status

Specify; mockup approval pending. User latest direction recovered from the prior
thread: put the optional bottom overview in AURA, keep the native composer in
the middle, do not create another plugin, use the supplied Shipyard reference,
and implement it. The previous runtime stopped on connection failures before
making product code changes. This turn refined the unfrozen specification and
added capability delta, mockup, authenticated snapshot and UI/UX advisory.

User choice requested in thr_pzjrmu9rix: approve and implement, or revise layout.
Do not treat elapsed time or this continuation as approval. Once they approve,
record their exact choice in mockups/approval.md (Styling: reference), finish
Specify at its current exact revision, and continue all returned actions.

## Preview

`empirical mockups` is running in exec session 46230, port 34899;
https://cerq--34899.getbb.app/compact.html is exposed. Inline preview is
mockups/compact.html. The one direction supports overview on/off, dark/light,
snapshot/loading/empty/unavailable/error. Date/count aggregates came from
authenticated `gh api graphql`; snapshot.json contains no credentials or repo
content. Follow-up links are omitted until there is a real source response.

## Findings for implementation

- Existing checkout is older than installed AURA. The installed version is
  0.2.3 at `/home/dyaus/.bb/plugins/cache/git/github.com/MateoCerquetella/bb-plugins/d205cb7534b8d5a210b78c32dd2487d5722f391b/plugins/aura`.
  Its lib/background.ts matches this checkout. Inspect other changed files
  before implementing, so the installed behavior is preserved.
- Standalone Activity Overview exists in origin/main and is installed, but has
  hardcoded counts, period multipliers, generated cells and fake attention
  buttons. Do not copy those. Do not merge all of main merely to bring in this
  plugin; the user wants the feature owned by AURA.
- AURA already decorates root-compose-main-panel with a content script and
  centers native compose content. Keep native nodes intact. Investigate the
  supported homepage slot versus current full New Thread host layout before
  choosing a safe insertion; no cloned controls or layout outside that pane.
- AURA settings persist in plugin SQLite via lib/model.ts and server.ts; its
  settings/global preservation rules in apply/activate/reset need to include
  the new default-off overview preference. Ensure disabled overview preserves
  composer centering, including background disabled cases per the latest request.
- Authenticated `gh` works on this host. Use argv calls with bounded timeout,
  size limit and sanitized API errors; do not expose raw CLI stderr or credentials.
- GraphQL search should use the returned viewer login explicitly, not author:@me.
  Opened/merged counts use created/merged search date ranges. Reviews are
  contribution records, not arbitrary event totals. Repository scoping cannot
  relabel the global calendar: use scoped dated records or explicit unavailable.
- Root node_modules was absent during inspection. Root package pins bb-app
  0.40.0; check its shipped SDK version before installing dependencies. Build
  scripts must clear BB_CLI. Follow required npm install / npm run check gates.
- Browser skill read: plugins/steel-browser/skills/steel-browser/SKILL.md.
  Steel project binding was checked in this thread: CDP 127.0.0.1:9320 is
  reachable. Run project again for current binding before browser work.
  Browser cannot reach BB host via 127.0.0.1:38886 (Docker loopback).
  https://cerq.getbb.app shows an unauthenticated Connect sign-in page in Steel.
  Actual installed-app browser verification will require the user's direct
  sign-in in the embedded session; do not bypass or switch browsers.
- Mockup browser pass used Node's WebSocket CDP attached to this Steel browser,
  not a launched browser. Script: /tmp/aura-mockup-browser.mjs. Evidence:
  /home/dyaus/.bb/thread-storage/thr_pzjrmu9rix/aura-mockup/.

## Preserved work

Unrelated Empirical closure changes were present at turn start. They include
deleted/compacted event journals and closure/completion files for older features.
Do not reset, stash or include them accidentally in a feature commit.
No AURA product code or other plugin files have been changed in this turn.
Tracker remains local-only. No release publication is authorized.
