# Design

Keep existing Build/Review schemas and persisted records. New final messages
begin with one `taskboard-result` directive containing kind, verdict, and an
optional revision. The remaining message is Markdown, persisted as summary or
findings. Legacy XML/JSON parsing remains for old runs.

The directive component is display-only and uses validated attributes, never
the latest mutable run. Invalid attributes show a neutral unavailable status
and leave ordinary Markdown untouched.

A shared error notice owns title, next-step copy, and collapsed exact details.
Existing Factory components retain ownership of every recovery action.

Do not infer success from prose. An implemented Build requires a revision and a
blocked Review requires findings. Reject repeated directives, wrong kinds,
unsupported fields, and malformed headers conservatively.

Test parser functions with new, legacy, invalid and ambiguous input. Run Factory
tests and Taskboard typecheck/build. Inspect bundled components at desktop and
390px, with closed/open diagnostics and light/dark screenshots.

## Automatic stage handoffs

Keep `FactoryRecord.runs` as the sole persisted lifecycle and recovery ledger.
Keep dispatch, reconciliation, and transition ownership in `service.ts`.
The existing ticket lock and store versioning serialize native dispatch.

Normal Investigate, Plan, Build, and Review stages call `threads.spawn` without
conversation inheritance. Plan reuses the investigation environment. Initial
Build creates a managed worktree on the same host without `sourceThreadId`.
Review reuses the Build worktree in a fresh thread.

Build continuation and review repair retain `threads.send` to the original
Build thread and worktree. They retain `continuationOf` and `repairOf`
provenance. Dispatch intent remains durable before the native call. Ambiguous
responses remain uncertain and never auto-retry.

Plan receives bounded investigation output for the current scope. Build
receives the exact approved plan within its existing persisted limit. Review
receives bounded Build evidence and its revision, thread, and environment.
Recovery prompts include bounded findings. Label prior agent output untrusted.

| Latest result | Automatic action |
| --- | --- |
| Investigate finished | Fresh Plan |
| Plan has output | Save and approve, then fresh Build |
| Build implemented with revision | Fresh Review |
| Build blocked with findings | Continue up to twice per plan and scope |
| Build blocked at limit | Pause with manual Continue |
| Needs-input, unknown, uncertain, stale, unavailable | Pause without retry |
| Review blocked | Existing bounded review repair |
| Review passed | Stop without granting human acceptance |

Count all continuation runs for the current plan and scope conservatively.
Manual Continue does not reset the automatic budget.

Drain ascending native event pages until exhausted or the cursor fails to
advance. Observe live thread state after events. Active native work takes
precedence over cached finished or paused labels and prevents another dispatch.
For historical shared threads, update only their newest run.

## Session navigation

Keep selected run identity in local React state. Default to the newest run,
preserve explicit selection for the same task, and fall back if it disappears.
One select lists stage, attempt, and status. One Open session action navigates
to that selection. Recovery controls remain tied to the latest run, outside
historical selection. At 390px the navigation action wraps below the selector.

## Verification additions

Exercise distinct stage IDs, bounded handoff content, original worktree reuse,
automatic initial Review, two Build continuations, unsafe stop states, event
pagination, live resumed activity, and concurrent dispatch. Browser checks
exercise historical navigation without moving current recovery ownership.
