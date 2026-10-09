# Fix The Taskboard Automatic Start Behavior That Pauses Work When

## Request

> Fix the Taskboard automatic-start behavior that pauses work when a build reports recoverable blockers like the supplied Roten-App result. Improve automatic work startup so blocker summaries are handled accurately and the task does not stop prematurely when actionable implementation work can continue, while preserving genuine human-decision, tracker, evidence, and policy gates.

## Goal

Resume blocked Builds explicitly in the original session and worktree, and
clear obsolete pauses when a new native turn resumes. Preserve required human,
policy, tracker, and evidence gates.

## Acceptance Criteria

- [ ] [AC-1] Start task on a blocked Build resumes the same managed session once.
- [ ] [AC-2] Resume prompts include previous blockers and preserve repository gates.
- [ ] [AC-3] Resumed Build evidence advances to review; unresolved results pause.
- [ ] [AC-4] Concurrent requests, workspace drift and uncertain dispatch cannot duplicate work.
- [ ] [AC-5] A new native Build turn clears only its obsolete Build-result pause.
- [ ] [AC-6] Create new ticket offers Improve with AI when title or description
  contains draft text and a BB project is selected.
- [ ] [AC-7] Improvement uses a hidden helper with the project's current
  provider/model defaults and replaces title and description only after a
  valid structured result.
- [ ] [AC-8] Improving never creates a ticket, changes provider metadata, or
  discards the draft on failure; loading, cancel, error and retry are accessible.
- [ ] [AC-UI-1] [UI] The action fits direct and composer-assisted ticket
  creation at wide and compact modal widths without obscuring fields or actions.

## Scope

Iteration 4: Creation accepts up to five PNG/JPEG/WebP clipboard images (2 MB
each), with previews and removal. Composer-assisted creation attempts clipboard
read on the user's click; the pinned SDK exposes attachment counts only, so
unavailable composer images must prompt re-paste rather than silently disappear.
Linear uploads use provider-native storage before issue creation. Other
providers reject image-bearing creation explicitly until supported; no public
hosting fallback. Improve produces specific concise text without invented facts.
Create only is the default submit and opens the new Taskboard issue without
starting work. Start now creates once then explicitly starts Factory work.
If starting fails after creation, retain the created issue and never recreate it.

- [ ] [AC-CREATE-1] Pasted images preview and can be removed; upload failures preserve the draft and prevent incomplete creation.
- [ ] [AC-CREATE-2] Create only opens the created issue without starting work; Start now starts only after successful creation.
- [ ] [AC-CREATE-3] Improvement removes filler, preserves constraints and links, and adds no invented requirements.

- [ ] [AC-UI-2] Progress uses BB semantic colors, reported phase/steps and
  accessible thread-header status; commands start collapsed with outcome counts.
- [ ] [AC-UI-3] Starting work does not pin Taskboard; closing it remains effective.
- [ ] [AC-UI-4] Original ticket opens the linked provider detail inside Taskboard.
- [ ] [AC-UI-5] Changed files expands into BB's native unified diff viewer with
  one selectable entry per reported file, loading and unavailable states, and
  no fabricated patch content.
- [ ] [AC-UI-6] Current work is visually primary, prior runs are compact, and
  live activity uses restrained reduced-motion-safe animation without repeated
  stage headings or excessive vertical separators.

Original ticket addition: the progress view must offer an Original ticket
action that opens the linked Linear issue inside Taskboard's existing ticket
detail view, with description, metadata and comments from the configured
connection. Retain the external Open in Linear link. Do not iframe Linear or
pin the panel. Loading or access failures must not alter the active run.

Iteration 2 proposal, pending mockup approval:
- Use BB theme tokens for active, completed, attention and failed states.
- Collapse command history by default while preserving visible totals, failed
  counts and the latest command; expand individual output only on demand.
- Keep a legible phase/status control in the native thread header, including
  compact viewports. Open the progress details through the supported native
  header action; do not inject a custom persistent banner into BB's thread DOM.
- Show stage progression, reported steps and recent activity without invented
  percentages, ETAs, or completion claims. Distinguish stale refreshes and waits.
- Start work may open the worker thread and Taskboard, but must not pin the
  panel or make it sticky. Closing it keeps it closed during progress updates.
  The native thread-header progress control remains independently available.
- Preserve existing resumption, stop/navigation, recovery and approval behavior.
- Verify keyboard disclosure, light/dark contrast and compact-width overflow.
- Resolve each changed-file patch from the managed Build environment and the
  repository diff target at view time. Render it through the SDK-owned diff
  component so syntax colors, unified layout and future host renderer overrides
  remain consistent with BB. A missing environment, removed file, oversized
  patch or fetch failure must remain an explicit unavailable state.
- Present one current-work header and activity block. Previous runs use compact
  summaries and reveal their full evidence only on demand. Animate only a small
  active-status mark and newly arriving updates; never animate completed,
  blocked or failed evidence. Honor `prefers-reduced-motion`.

Factory service, durable continuation linkage, prompts, regression tests and README.
User approved fast-forward to the existing factory feature base.
Create-ticket UI, typed improvement RPC, hidden-helper lifecycle, result parser,
and provider/model inheritance matching the Improve Prompt interaction.

## Non-goals

No policy decisions, gate bypass, replacement worktrees, publication or tracker closure.
No increased review repair allowance.
No automatic ticket submission, provider metadata rewriting, free-form agent
execution, or exposure of helper thread output before validation.

## Risks

Duplicate sends, stale approvals, moved workspaces and obsolete error messages
must remain guarded. Unknown dispatch outcomes cannot be automatically retried.
AI output may be malformed or a helper dispatch may be uncertain; the original
draft remains authoritative until a validated title/description pair returns.
Diff reads may race workspace changes or exceed bounded response sizes; the UI
must identify stale/unavailable data and must not imply that a path list is a
patch. Motion can distract or obscure state if overused; it is limited to live
work and disabled by the user's reduced-motion preference.

## Verification

Focused factory tests, Taskboard typecheck and check, and git diff --check.
Creation-improvement parser/server tests plus browser screenshots at desktop
and compact modal widths. Diff verification covers patch retrieval, missing
environment/error states, file selection and native renderer output. Progress
screenshots cover running, blocked and completed states in light/dark themes
and reduced-motion emulation.

## Capability Deltas

deltas/taskboard-build-resumption.md
deltas/taskboard-ticket-drafting.md
