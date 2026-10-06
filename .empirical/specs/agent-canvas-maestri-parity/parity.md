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
| Maestro and reusable agent roles | Removed Control UI; bounded retained backend | Role editor and explicit native recruitment/assignment/stop; scoped Maestro team tool | Implemented; authorization tests pass; live actions pending |
| Composer mentions/drafts/images/chat subjects | Native timeline only | Native composer draft/image behavior and signed connected-note mention provider, with fresh content resolution | Implemented; native mention UI evidence pending |
| Workspaces and floors | Workspace/worktree filters | Shared workspace viewports, native worktree composer, real changes/PR review and native floor navigation; further landing preparation pending | Partial |
| Partituras | Absent | Save/search/rename/delete/place plus independent versioned library transfer preserving roles/cables/groups | Implemented; model tests and fixture placement pass |
| Fichários | Absent | Named collections, member focus, search, reusable templates, cross-workspace placement and versioned transfer | Implemented; model tests and fixture placement pass |
| File tree/editor/search | Absent | Real environment paths/read/write with hash checks and root binding; integration tests remain | Implemented; host evidence pending |
| Portals / design mode | Authorized browser captures | Project Steel navigation RPC and embedded interactive viewer; annotation/design-mode controls remain | Partial; navigation smoke passed, authenticated viewer pending |
| Routines | Absent | Native Automations create/edit/pause/resume/delete, target execution inheritance; sequential chains remain | Partial; paused native lifecycle smoke passed |
| Batuta search and shortcuts/settings | Basic navigation shortcuts | Search palette, keyboard actions and default-size/grid settings implemented | Implemented; fixture checked |
| Agent usage | No per-node usage | Supported BB provider usage integration | Outstanding |
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
