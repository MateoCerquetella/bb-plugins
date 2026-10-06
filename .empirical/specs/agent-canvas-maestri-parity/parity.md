# Reference parity inventory

Reference: https://www.themaestri.app/en and public /en/docs pages recorded in research/. Baseline inspected at e4f7122ad. Implementation checkpoint updated 2026-10-06; rows below distinguish code from completed acceptance evidence.

| Feature family | Existing baseline | Required work / adaptation | State |
| --- | --- | --- | --- |
| Fine grid, insertion pill, sidebar, node chrome | Dot grid, project tabs, plain chrome | Square grid, toolbar, sidebar and controls implemented in workbench.tsx/css; fixture screenshots collected | Implemented; live UI evidence pending |
| Pan, zoom, fit, minimap, free positioning | Present | Alt-wheel, viewport minimap and shared remembered viewport implemented | Implemented; fixture checked |
| Terminal/chat nodes | Native live BB ThreadChat timeline | Native composition/roles; real thread PTY terminal view with xterm, separate from the provider runtime | Adapted; native PTY smoke passed, UI evidence partial |
| Notes / text / drawings | Absent | Editable persistent nodes, Markdown preview and drawing implemented | Implemented; fixture checked |
| Resize/selection/lock/blur/lift/dock | Move/resize/single selection | Multi-selection, privacy blur, lock and lifted/docked panels implemented | Implemented; some browser checks pending |
| Groups, align/distribute/tidy/snapping | Automatic workspace squares | Authored groups and nine arrangement operations; locked geometry preserved | Implemented; model tests pass |
| Undo/redo, copy/paste, clone, import/export | Saved pane geometry | Bounded validated v1 document/history, remapped composition copies and JSON backup | Implemented; model and fixture tests pass |
| Connections, cross-workspace context | Recorded parent and browser links | Authored links, deterministic traversal and per-call scoped note tools implemented | Implemented; authorization tests pass |
| Maestro and reusable agent roles | Removed Control UI; bounded retained backend | Role editor, five editable instruction presets seeded once, and explicit native recruitment/assignment/stop; scoped Maestro team tool | Implemented; authorization tests pass; live actions pending |
| Composer mentions/drafts/images/chat subjects | Native timeline only | Native composer draft/image behavior and signed connected-note mention provider, with fresh content resolution | Implemented; native mention UI evidence pending |
| Workspaces and floors | Workspace/worktree filters | Explicit workspace pickers in sidebar and agent panel, compact native floor navigation, shared workspace viewports, native worktree composer and real changes/PR review; further landing preparation pending | Partial |
| Partituras | Absent | Save/search/rename/delete/place plus independent versioned library transfer preserving roles/cables/groups | Implemented; model tests and fixture placement pass |
| Fichários | Absent | Named collections, member focus, search, reusable templates, cross-workspace placement and versioned transfer | Implemented; model tests and fixture placement pass |
| File tree/editor/search | Absent | Real environment paths/read/write with hash checks and root binding; integration tests remain | Implemented; host evidence pending |
| Portals / design mode | Authorized browser captures | Project Steel navigation RPC and embedded interactive viewer; annotation/design-mode controls remain | Partial; navigation smoke passed, authenticated viewer pending |
| Routines | Absent | Native Automations create/edit/pause/resume/delete, target execution inheritance and sequential chains with completion ordering, pause and interruption protection | Implemented; native lifecycle and two-step ordered chain smoke passed |
| Batuta search and shortcuts/settings | Basic navigation shortcuts | Search palette, keyboard actions and default-size/grid settings implemented | Implemented; fixture checked |
| Agent usage | No per-node usage | Supported BB provider usage integration in agent actions | Implemented; live UI evidence pending |
| SSH/Docker/runtime environments | BB environment labels | Use actual BB host/environment facilities | Partial |
| Native devices, Metal/APFS, Spotlight | No native runtime | Demonstrate host/API limits; document BB alternatives | Capability assessment pending |
| Ombro / Wire | No on-device companion or native mobile app | BB attention/summary and remote access adaptations; no false native parity | Capability assessment pending |

Portable outstanding rows keep this feature and user goal active. Screenshots alone do not prove functional parity.

## Checkpoint evidence

- `npm install` and root `npm run check` passed during resumption before the final Maestro/floor additions. Latest Agent Canvas check passed with 18 tests, TypeScript, SDK pin and build after those additions. Broader acceptance verification remains pending.
- Installed/reloaded local Agent Canvas and exercised `bb agent-canvas status --json` against real BB data. No real agents were spawned/stopped for smoke testing.
- Steel development fixture checked Shift selection, search, node insertion, undo/redo, reload persistence and stacked narrow-screen access. Screenshots: `docs/media/agent-canvas-workbench-{light,dark,narrow}.png`. SDK testing icons are placeholders; these images do not prove the native icon or chat integration.
- Direct project CDP page actions were used because browser-level Playwright attachment stalled against the current Chromium build. The fixture was served within the same project Steel container. The public shared fixture URL requires BB Connect sign-in. Authenticated BB human UI verification is still pending; fixture evidence is not substituted for it.
- Empirical remains at Implement revision 5, local-only. Fresh-context review, required verification receipts and independent integration have not occurred.

## Second implementation pass

Evidence is detailed in `research/verification-2026-10-06.md`. Agent Canvas has
24 passing tests; Steel Browser has 40. The workspace check passed during this
pass, followed by focused validation and a browser regression for stacked-layout
viewport preservation. This remains implementation progress, not completion of
the original portable parity contract.

## Usability continuation from thr_i92zicydn5

The urgent UI/workspace/role slice is implemented and installed. Native composer
and chat controls are excluded from canvas CSS resets. The create panel is wider,
workspace/floor labels use authoritative host metadata, drafts survive a workspace
change, and created-agent navigation follows the submitted workspace. Missing
canvas icons use local SVG artwork instead of the host Zap fallback.

Five presets migrate once with a document revision update. The installed plugin's
readDocument RPC confirmed Maestro, Engineer, Reviewer, Designer and Researcher
with their instructions and rolePresetsVersion 1. Custom roles and intentional
preset deletion are covered by migration tests.

Root npm install and npm run check passed; the final Agent Canvas check passed
32 tests plus TypeScript, SDK pin validation and build. Steel fixture flows checked
workspace/floor selection, role options, draft retention, environment reset,
submitted workspace/role instructions, and desktop/mobile panel bounds.
Screenshots: docs/media/agent-canvas-agent-setup-{desktop,mobile}.png and
agent-canvas-role-presets.png. The fixture uses SDK testing mocks for native
composition/icons and does not prove the real host composer or a real agent launch.
Authenticated BB UI verification remains pending: the public app required sign-in.

The existing native two-step chain proof is preserved in
research/chain-runtime-proof.json. Full parity, fresh-context review, Empirical
phase receipts and independent integration remain open. Sync was refused because
unrelated journal changes leave this checkout dirty; the prior Steel server merge
conflict was not changed during this slice.
