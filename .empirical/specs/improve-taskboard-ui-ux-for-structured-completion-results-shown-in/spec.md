# Improve Taskboard result and error presentation

## Request

> Improve Taskboard UI/UX for structured completion results shown in BB threads and for errors displayed inside Taskboard tasks. Replace raw JSON-like result blocks such as {"verdict":"blocked","findings":"..."} with a compact, scannable status presentation that preserves full detail, and improve task error states so they communicate what failed, what the user can do, and optional technical details. Keep the work scoped to plugins/taskboard, follow existing design patterns, preserve accessibility and responsive behavior, and verify the real UI in a browser with screenshots plus focused tests.

## Goal

Make Factory results and failures readable at a glance in both native BB
threads and Taskboard task details without weakening the structured verdicts
that drive automation.

## Iteration 3 adjustment

Automatically hand off Investigate, Plan, Build, and Review into distinct fresh
native threads with bounded explicit context. Continue actionable blocked Builds
at most twice in the same managed implementation worktree before requiring
manual Continue. Never invent decisions or retry uncertain dispatches. Reconcile
resumed native activity before showing Paused or Turn finished. Replace repeated
Open session buttons with one stage/session selector and one Open session action.

## Iteration 6 adjustment

Use Taskboard's current branding artwork on the work-item mention created from
the New Thread prompt. Keep the create-from-prompt button on the existing
library ticket glyph and keep the unrelated New Thread panel launcher on its
original Target icon.

## Acceptance Criteria

- [ ] [AC-1] A new Build or Review completion displays a native Taskboard
  result card in the BB thread instead of a raw JSON object.
- [ ] [AC-2] The result card communicates the stage and verdict at a glance,
  while the agent's summary or findings remain readable Markdown. Missing or
  malformed card attributes never hide that Markdown.
- [ ] [AC-3] Taskboard parses and persists new directive results with the same
  conservative automation semantics as the existing structured contract.
- [ ] [AC-4] Existing persisted XML/JSON result blocks still parse correctly.
- [ ] [AC-5] Factory task failures show a short title, a useful next step, and
  expandable technical details without duplicating the same raw error. Recovery
  actions come only from the existing run state.
- [ ] [AC-6] Existing retry, continue, recovery, status-sync, original-ticket,
  and session navigation actions remain available in the states that own them.
- [ ] [AC-UI-1] [UI] Result and error presentations fit 390px and desktop
  viewports without horizontal overflow and expose status through accessible
  names and alert/status roles.
- [ ] [AC-7] Automatic Investigate, Plan, Build, and Review each start a fresh
  native thread without inherited conversation. Plan receives bounded
  investigation findings, Build receives the exact approved plan, and Review
  receives bounded Build evidence and the implementation revision.
- [ ] [AC-8] An initial implemented Build automatically starts Review. A blocked
  Build with actionable findings automatically continues at most twice per
  approved plan and scope in the original managed worktree. Existing manual
  continuation remains available after the limit. Needs-input, unknown results,
  uncertain dispatch, changed scope, and unavailable environments never retry.
- [ ] [AC-9] Reconciliation drains native event pages and observes current thread
  activity before displaying a finished or paused run or dispatching another
  stage. Concurrent reads and starts cannot duplicate a dispatch.
- [ ] [AC-UI-2] [UI] One accessible session selector and one Open session action
  replace repeated navigation buttons. It defaults to the newest run, preserves
  an explicit selection while the ticket stays open, and falls back when that
  selection disappears. State-owned recovery controls remain available.
- [ ] [AC-UI-3] [UI] A work-item mention created from the New Thread prompt uses
  Taskboard's current branding artwork. The create-from-prompt button retains
  its existing ticket glyph, and the New Thread panel launcher retains Target.

## Scope

- `plugins/taskboard/factory/contract.ts`
- `plugins/taskboard/factory/review.ts`
- `plugins/taskboard/factory/service.ts`
- `plugins/taskboard/factory/app.tsx`
- Taskboard app registration, styles, focused tests, and browser fixtures
- Existing Factory dispatch, reconciliation, and recovery policy

## Non-goals

- Redesigning the whole Taskboard board or issue detail
- Changing BB's core Markdown renderer
- Treating an agent verdict as human acceptance
- Migrating or rewriting stored historical run output
- Adding a new server mutation or result-submission tool
- Replacing the persisted run model or adding a second workflow scheduler
- Creating replacement worktrees during recovery or treating Review as acceptance
- Redesigning the create-from-prompt button or the New Thread panel launcher

## Risks and bounds

- Fresh stages cannot rely on prior conversation. Prompts explicitly identify
  source runs and delimit agent output as untrusted evidence.
- Approved plans remain exact within the existing persisted size limit.
  Investigation and Build excerpts have explicit per-field bounds.
- Lost native dispatch responses remain uncertain and require explicit recovery.
- Main stages use fresh threads. Build continuation and review repair retain
  the existing same-thread recovery contract and original worktree.
- Historical records with reused threads remain readable and retain their
  original run results.

## Verification

- Focused parser and Factory behavior tests
- Taskboard typecheck and production build
- Browser checks against the real bundled components at desktop and 390px
- Light and dark screenshots covering blocked results and task errors
- Review of the final diff for parsing safety, accessibility, and state-action
  regressions
- Service tests for four distinct stage threads, exact worktree reuse, bounded
  recovery, uncertainty, concurrent reconciliation, and event pagination
- Browser checks for session selection, navigation, live state, and recovery
  controls at desktop and 390px
- A screenshot of a created work-item mention in the New Thread composer

## Capability Deltas

- `deltas/taskboard-agent-progress-ui.md`
