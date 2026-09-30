# Conversation Space (WIP)

**Work in progress.** The UI and Jev diagnostics are still being refined. This plugin is private and has not been released as a stable package.

An always-visible, icon-only composer context circle opens an anchored conversation-space popover above it with current context, remaining capacity, token breakdown, model/window and expandable details. Supports host themes and keyboard dismissal.

Uses BB’s latest context and token usage events, scoped to the current thread and reset on compaction/clear. Last-call total is an explicitly labelled estimate when no context measurement exists. Cached input is excluded from the Input row; reasoning is included in Output. Missing measurements remain unavailable.

Install: `bb plugin install ./plugins/conversation-space`

Check: `npm run check --workspace bb-plugin-conversation-space`

The compact popover uses BB theme colors and 12px text. Colored percentages are shares of the latest call's input + cached + output tokens; reasoning is included in output and must not be added again.

View details shows input cache reuse and Jev diagnostics for the latest turn. Jev data is matched to this provider session using its hashed cache scope, from at most 512 KiB of local log and 200 matching recent calls. Manual model turns show Off; missing logs show Unavailable. Counts include failed attempts at routing; the model distribution is recorded routing decisions, not proof of successful answers. Router overhead sums available classifier token measurements. Historical calls can reflect previous routing rules.

Jev selects models; it does not shrink context. Cache reuse is not a reduction in tokens. Savings are not claimed without a comparable baseline or pricing evidence.

Live browser checks are opt-in: set `BB_TEST_THREAD_URL` to a local BB thread using a manually selected model, and optionally `CHROMIUM_PATH`, then run `node plugins/conversation-space/test/popover-live.mjs` or `diagnostics-live.mjs` from the repository root. `circle-live.mjs` also navigates to another existing thread. Routing fixtures are synthetic; these checks do not send model calls.

**View details** opens Session usage: model, reported context and latest-call token details, session timestamps, Copy JSON, and searchable role-filtered BB event records. Older records load in pages of 100 events; counts and filters describe the loaded records, not unqueried history. Long records are truncated at 12,000 characters and marked. Copy JSON exports the loaded snapshot with truncation and pagination metadata. Unsupported billing and cache-write fields are hidden. Session totals use the provider’s cumulative counters. Category rows show explicit text estimates for loaded records, computed as content characters / 4 before display truncation; percentages are shares of those estimates, not attribution of the current context. BB events are not the full provider wire transcript. Live verification: `node plugins/conversation-space/test/session-live.mjs` with the same environment variables above.
