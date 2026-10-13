# Initial Inspection

## Baselines

- Working branch: `taskboard-with-mastra-factory-thr_suvnn4i6np`.
- Initial worktree was clean at `fc814c22f4d26170ff0b8a5a0ac6619a438480ac`,
  identical to freshly fetched `origin/main`.
- PR #57 remains open, draft, non-mergeable at
  `203a79c5f2bff206670b17f0bfa081abe605f38e`.
- Installed Taskboard source reported by BB:
  `/home/dyaus/Developer/projects/MateoCerquetella/BB/taskboard-composer-fix/plugins/taskboard`.
- Installed checkout HEAD:
  `65496eaabe9f83a9a4f4f70ef20f75a77be12580`.
- Installed checkout had existing edits in its README, app.tsx,
  preparation/app.tsx, and Empirical context/spec state before this work.
  No writes were made there.
- No live Taskboard reload, install, tracker mutation, merge, or deployment was
  performed.

## Current Main

Taskboard has project-scoped GitHub, GitLab, Linear, and Jira adapters, durable
SQLite cache and preferences, issue detail and status controls, and composer
handoff. Current main has no execution or preparation directory.

Keep main's GitLab support and recent Linear finished-window behavior. Do not
replace main's plugin directory with the installed checkout, which predates
those changes.

## Installed Preparation

Committed changes `abd58c8c4`, `f1de2f04a`, and `13c5e96d7` add preparation
briefs, versioned prototypes, repository context, native BB jobs, safe
out-of-date editor handling, and restart handling.

Reuse candidates:

- Project-scoped durable documents and additive tables.
- Exact-revision brief edits and stale-response/editor guards.
- BB environment and execution-option capture.
- Native thread spawn and session links.
- Explicit handling of persisted starting jobs with no returned thread ID.
- Preservation of user edits when an agent result targets an older revision.

Required adaptations:

- Preparation prompts currently prohibit tools and use bounded source excerpts;
  they are not a real investigation/build workflow.
- Export and mention text inject Empirical-specific guidance. The new factory
  must not impose it.
- Existing preparation tables and artifacts must survive factory additions.
- Native event boundaries should replace simplistic idle/output inference for
  reusable authoring sessions.
- Installed user edits are not available for wholesale replacement or reset.

## PR #57 Review

Inspected execution contract, manager, request, server, verification,
agent-thread-store, panel, and targeted native thread code in server.ts.
This is not an exhaustive review of all changed lines.

Reuse candidates:

- Stable project/source/locator task keys.
- Dispatch identity and durable session linkage.
- Canonical schema-normalized SHA-256 approval digests.
- Per-record serialized operations, version guards, and generation checks.
- Full-byte-stream hashing for verification inputs, separate from capped display
  output.
- Abortable, bounded command execution and preservation of failed checks.
- Verification invalidation after restart and explicit acceptance review.

Reject or redesign:

- Native reconciliation calls `transitionAgentThreadProvider(..., 'done')` after
  a successful `turn/completed` event, including recovered links. This violates
  the central factory invariant.
- Durable native link insertion occurs after spawn; a lost response can leave
  an unlinked session. Persist intent before dispatch and fail closed on
  ambiguous outcomes.
- The execution manager is Symphony-specific and includes runtime endpoints and
  shared workspace assumptions; do not import it as the native runtime.
- `inspectWorkspace` requires `.git` inside the workspace and a directory named
  after the run ID, which is incompatible with normal managed Git worktrees.
- The panel's immediate-start path manufactures a plan and uses `git diff
  --check` as sufficient default verification; it bypasses the requested plan
  approval experience.
- Global Empirical ticket-binding prompts, automatic provider progression, and
  automatic repair loops must not be carried into the default factory policy.
- PR storage/source enums omit GitLab.

## SDK

Installed BB is 0.45.0 and reports plugin SDK 0.6.15. Its
`dist/index.d.ts` exposes native `threads.spawn`, `threads.send`, `threads.stop`,
`threads.events.list`, `threads.defaultExecutionOptions`, and environment APIs.

Current main's Taskboard manifest pins SDK 0.4.6. Before implementation, inspect
the lockfile's exact BB version and its shipped SDK contracts, reconcile this
with the repository's exact-SDK rule, and do not use the running `BB_CLI` to
silently repin build dependencies.

## Product References

- https://factory.mastra.ai/
- https://mastra.ai/blog/announcing-mastra-factory-beta

The references support configurable manual/automatic stage policies, linked
agent sessions, steering, and separate work acceptance, plan approval, and
review. Mastra is a design reference only.

## Mockup Verification

`mockups/index.html` is a simulated UI proposal, not product code or native
execution evidence.

Checked in the project's dedicated Steel browser using Playwright over its
returned CDP endpoint:

- Desktop 1280 x 1000: no horizontal page overflow, 20 rendered icons, brand
  image loaded.
- Mobile 390 x 844: no horizontal page overflow.
- No JavaScript page errors.
- Approved revision 2, edited plan, observed required approval of revision 3.
- Started build, canceled, retried, then finished sample turn.
- After sample turn: factory Build; tracker Open.
- Verified, started separate review, accepted review, explicitly moved to Done.
- After acceptance and explicit Done: factory Done; tracker Open.

Screenshots:

- Thread storage `taskboard-factory-desktop.png`.
- Thread storage `taskboard-factory-mobile.png`.

Steel's HTTP discovery returned a WebSocket URL without its forwarded port;
the successful Playwright connection preserved the observed browser path and
used the same project's returned port 9320. No other browser binding was used.

## Workflow State

Empirical MCP operations were not exposed and the `empirical` shell binary was
absent. Used the private fallback via published `empirical-sdd@0.42.0`.
Config schema 5 and setupComplete true were validated before mutations.
Tracker mode is disabled/local-only.

Empirical's loop/complex reconciliation also compacted and closed historical
feature journals unrelated to this change. These tool-generated changes must be
reviewed and excluded or reconciled deliberately before a product commit; they
are not Taskboard implementation changes.

The user subsequently approved the revised native-thread/right-panel direction.
See checkpoint.md for current implementation evidence and remaining work.
