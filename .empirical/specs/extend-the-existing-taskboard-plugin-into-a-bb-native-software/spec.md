# Extend The Existing Taskboard Plugin Into A Bb Native Software

## Request

> Extend the EXISTING Taskboard plugin into a BB-native software factory, using Mastra Factory as the product and workflow reference. Inspect current Taskboard main, the installed plugin source, and PR #57 first; identify reusable code and regressions; preserve existing tracker credentials, data, integrations, and user edits; do not merge #57 wholesale or replace the live installation. Taskboard owns Intake -> Triage -> Planning -> Build -> Review -> Done with configurable manual-by-default stage policies and explicit opt-in automation, while factory stage, agent-run status, and external tracker status remain separate. Retain original tracker identity and link native BB sessions, investigation, versioned plans, approvals, workspace, verification, and PRs. Reuse authoring context across stages and allow a separate linked review session. Use BB provider/account/model/environment/worktree/thread/permission systems and exact SDK contracts. Empirical, Symphony, Mastra, and LangGraph are not required runtimes and Taskboard must not inject Empirical policy globally. Reuse suitable #57 lifecycle and verification code, but a successful turn or completed event must never by itself mark a ticket Done. Deliver a working vertical slice: existing ticket -> Investigate -> inspect findings -> generate/revise plan -> approve exact plan revision -> Build in a BB-managed workspace -> inspect tests and changes -> Review with linked PR/evidence. Expose native sessions and actionable failures; support steering, cancellation, bounded retries, restart recovery, duplicate-dispatch prevention, and stale-approval invalidation. Keep merge, deployment, and tracker closure explicitly gated. Test transitions, stale approvals, duplicate starts, crash recovery, cancellation, and the regression where an agent turn finishes without the task finishing. Verify an actual native BB execution path. Implement in this clean branch. Do not merge, deploy, close real tickets, or replace the live Taskboard installation. Report reuse from #57, checks, demonstrated workflow, and limitations.

## Goal

Turn the existing Taskboard detail experience into a BB-native, manually
governed software-factory workflow. A user can take an existing tracker item
through investigation, a versioned and explicitly approved plan, implementation
in a BB-managed workspace, verification, and an independent review session
without losing the original tracker identity or conflating agent activity with
work acceptance.

## Acceptance Criteria

- [ ] [AC-1] Opening an existing GitHub, GitLab, Linear, or Jira item exposes a
  compact right-panel progress surface whose stage is one of Intake, Triage, Planning, Build,
  Review, or Done while continuing to show the provider's original status and
  identity separately.
- [ ] [AC-2] Factory policies are manual by default. A user may opt individual
  stage transitions into automation, and changing a policy does not alter the
  external tracker or retroactively dispatch work.
- [ ] [AC-3] Investigate starts exactly one native BB session for a dispatch
  identity, links it to the work item, preserves the selected BB execution
  settings, and exposes the session, run state, findings, and actionable
  failure in Taskboard.
  Send to agent navigates to that native thread and keeps Taskboard open in the
  right panel focused on the originating ticket, including after a reload.
- [ ] [AC-4] Investigation findings can be inspected before the user requests a
  plan. A finished BB turn records only its session outcome or produced
  artifact; it does not mark the factory item Done or close the tracker item.
- [ ] [AC-5] Plans are immutable revisions. The user can generate, edit, and
  revise a plan, and approval records the exact revision and content digest.
  Any scope-affecting edit invalidates that approval.
- [ ] [AC-6] Build is unavailable until the current plan revision is approved.
  Starting Build is idempotent and creates or reuses one BB-native
  implementation session in a BB-managed environment/worktree linked to the
  work item and approved plan.
- [ ] [AC-7] The user can steer a running native session, cancel it, and retry a
  failed or canceled stage within a bounded retry limit. The UI reports which
  action failed and whether a retry is available.
- [ ] [AC-8] Restart recovery never duplicates an ambiguous dispatch. Durable
  queued/running records reconcile to their linked BB sessions; a record that
  was persisted as starting without a confirmed session is surfaced as
  recoverable failure requiring an explicit retry.
- [ ] [AC-9] Build completion records the implementation session outcome,
  workspace/environment identity, change summary, tests, revision, and linked
  pull request evidence when available. A successful or completed BB turn alone
  never advances the item to Done.
- [ ] [AC-10] Required verification evidence is bound to the approved plan and
  implementation revision. Failed, stale, missing, or canceled checks prevent
  review acceptance and remain inspectable.
- [ ] [AC-11] Review may start a separate native BB session linked to the same
  work item, approved plan, implementation revision, and PR/evidence. Review
  acceptance is a distinct user decision from plan approval and work
  acceptance.
- [ ] [AC-12] Done requires accepted review evidence and an explicit user
  transition. Taskboard never merges, deploys, closes a tracker item, or changes
  its provider status merely because a session or check completed.
- [ ] [AC-13] Existing connector credentials, cached work, source adapters,
  browse preferences, tracker mutations, composer handoff, and user-authored
  preparation content continue to work without schema reset or destructive
  migration.
- [ ] [AC-UI-1] [UI] The item detail surface shows the factory stage, external
  tracker status, linked native sessions, current plan revision and approval,
  workspace, verification, PR evidence, and failures in a compact workflow view
  with accessible controls on desktop and mobile. The native thread remains
  the primary work surface; steering and stop remain BB's native controls.
- [ ] [AC-UI-2] [UI] Action labels and enabled states make the current gate
  explicit: Investigate, Generate plan, Approve plan revision, Start build,
  Verify, Start review, Accept review, and Move to Done cannot be mistaken for
  one another.
- [ ] [AC-TEST-1] Automated coverage exercises valid transitions, stale
  approvals, duplicate starts, restart recovery, steering, cancellation,
  bounded retries, separate review sessions, and the regression where an agent
  turn completes without the work being completed.
- [ ] [AC-LIVE-1] A real BB-native session is dispatched and observed through
  the implemented Taskboard path or a non-mocked integration harness, without
  replacing the user's live Taskboard installation or touching a real tracker
  item.

## Scope

- Evolve `plugins/taskboard`; do not add another plugin or task registry.
- Reconcile current `origin/main`, the installed Taskboard preparation source,
  and selected reusable code from PR #57.
- Add durable factory, plan, approval, session-link, verification, and review
  storage with additive migrations.
- Add typed RPCs, native BB thread dispatch/reconciliation, stage policy, and
  factory controls to the existing item detail surface.
- Preserve tracker adapters and keep provider status transitions behind their
  existing explicit controls.
- Add focused unit/integration/UI coverage, root checks, and browser evidence.

## Non-goals

- Installing Mastra, Symphony, LangGraph, or Empirical as a Taskboard runtime.
- Making Taskboard impose Empirical commands, ticket bindings, or evidence
  policy on target repositories.
- Merging PR #57 or importing its Symphony runtime and broad repository state.
- Creating a second ticket database, runner plugin, copy-prompt queue, provider
  account system, authentication system, or permission model.
- Automatically merging pull requests, deploying software, closing tracker
  items, or changing live tracker state during verification.
- Replacing or reconfiguring the user's currently installed Taskboard plugin.
- Solving organization-wide learning, release automation, or production
  monitoring in this vertical slice.

## Risks

- Native thread terminal events describe a turn, not acceptance; treating them
  as work completion can close unfinished tickets.
- Process crashes between durable intent and `threads.spawn` can make dispatch
  identity ambiguous; recovery must fail closed instead of spawning twice.
- Plan edits, tracker refreshes, or workspace changes can make approval and
  evidence stale.
- Installed preparation work predates newer main features such as GitLab and
  recent Linear behavior; integration must preserve both lines rather than
  copying an old checkout over main.
- Long-lived sessions and event polling can leak work after plugin reload unless
  cancellation and background loops honor abort signals.
- UI density can obscure the distinction between factory stage, agent state,
  verification, and tracker status.

## Verification

- `npm install`
- `npm run check`
- Focused Taskboard transition, persistence, native-session, and UI contract
  tests.
- Browser verification in BB at desktop and mobile widths, including stale
  approval, failed run, verification, and separate review states.
- A real native BB session dispatch with a harmless repository-local task,
  observed through its persisted Taskboard link and terminal-event
  reconciliation.
- Confirm the installed Taskboard source remains unchanged and no real tracker
  mutation, merge, deployment, or ticket closure occurred.

## Capability Deltas

- `deltas/taskboard-software-factory.md`
