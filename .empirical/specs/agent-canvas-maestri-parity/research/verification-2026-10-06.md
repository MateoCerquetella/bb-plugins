# Native integration and fixture evidence — 2026-10-06

- Agent Canvas check: 24 tests pass, TypeScript passes, SDK pin check passes,
  build passes. Includes roles/graph/history, scoped notes/mentions, routine
  inheritance/project denial and library transfers.
- Steel Browser check: 40 tests pass, TypeScript/SDK/build pass. New tests cover
  project endpoint retention, exclusion of browser-UI targets, and rejection of
  credential-bearing/non-web destinations before connecting.
- Root `npm install` and `npm run check` passed during this pass before the final
  responsive viewport correction; the focused plugin check passed afterward.
- Native routines: created a paused test via `bb automation create --project
  proj_ykxahiys47` (origin agent, createdBy thr_i92zicydn5). Agent Canvas listed
  it, updated its prompt/schedule while preserving paused state, and deleted the
  exact test record. No activation/run occurred.
- Native PTY: thread-scoped terminal ran only `printf` with the integration
  marker. Real daemon output contained `agent-canvas-pty-ok`, status exited and
  exitCode 0. Closed that exact clean session. This verifies BB PTY availability;
  it does not prove provider-private PTY attachment or the authenticated terminal UI.
- Portal: installed/reloaded the local Steel extension and called its `navigate`
  RPC for this project's fixture. It returned the actual fixture URL and
  project session viewer. No new browser, foreign cookies, or paid engine used.
  Later, external state switched installed Steel to checkout thr_93e5633gqa
  (PR #68 already merged), so its running registry no longer included navigate.
  Preserved that source choice and used the same project CDP for fixture tests.
  Final combined integration still needs installed verification.
- Fixture checks: multi-selection, search, insertion, undo/redo, reload persistence,
  narrow stacking and desktop viewport preservation; library save/place for an
  ensemble and reusable note collection. The viewport test detected a real bug:
  stacked scroll coordinates had overwritten the spatial viewport. Corrected by
  preserving the saved spatial view on narrow screens and restoring it on return.
  Scripts now guard the fixture origin before changing storage or clicking.
- Screenshots updated under docs/media/agent-canvas-workbench-{light,dark,narrow}.png.
  SDK testing icons/chat/host responses are mocks. These are development fixture
  evidence and do not replace authenticated installed BB UI verification.
- Terminal renderer follows xterm's documented input/output/fit interfaces:
  https://xtermjs.org/docs/api/terminal/classes/terminal/
  https://xtermjs.org/docs/guides/using-addons/

Remaining portable work includes sequential routine chains, richer search,
portal annotation/design interactions, comprehensive host/BB UI scenarios,
remaining reference inventory, review receipts and independent integration.
No goal or Empirical phase was marked complete.
