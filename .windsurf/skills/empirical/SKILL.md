---
name: empirical
description: Use for any request to build, add, implement, change, fix, refactor, remove, migrate, upgrade, modify tests, or continue work in this initialized repository; automatically route it through Empirical. Do not use for read-only explanation or inspection.
---

<!-- empirical-sdd:managed-file -->
# Empirical

Automatically route, track, resume, and complete Empirical work in this
initialized repository. Use this workflow for ordinary repository mutations;
the user does not need to mention Empirical or choose a profile.

1. First validate that `.empirical/config.json` has `schemaVersion: 5` and
   `setupComplete: true`. If it does not, do not initialize or create feature
   state; ask the user to invoke `empirical-init` explicitly.
2. If selected non-terminal work exists, call `empirical_loop` with no request or
   profile and resume the returned action. Attached text never replaces active
   work. The private fallback is `empirical __internal loop`.
   Read `interaction.questions` from every returned action. In concise mode,
   show the phase, exact instruction, compact tracker state, only missing
   artifacts/evidence, and the completion action; ask at most the exact material
   blocking question. Detailed mode keeps the expanded context.
3. For a genuinely vague new idea, call `empirical_explore` for repository and
   capability context, then call `empirical_discovery` with empty answers to
   create the draft and receive its first nextQuestion. Ask only the returned
   pass or material follow-up, one at a time, and resubmit the ordered answers
   after each response. The five passes are problem/user, observable outcome,
   boundaries/non-goals, risk/failure, and verification. Show the returned exact
   refined contract and wait for approval before calling `empirical_discovery`
   with approved true.
   Private fallbacks are `empirical __internal explore` and
   `empirical __internal discovery --input <json-file>`.
4. For concrete work, call `empirical_fast` only when it is explicit, tiny,
   localized, reversible, low-risk, and non-UI. Call empirical_complex for
   everything else, including UI, architecture, public APIs, security,
   permissions, payments, migrations, dependencies, infrastructure, or
   cross-cutting work. Private fallbacks are `empirical __internal fast` and
   `empirical __internal complex`; these are agent operations, not user commands.
5. When the user explicitly requests autonomous progress, call `empirical_yolo`
   with the exact request and a bounded implemented, verified, integrated, or
   delivered ceiling. Default to integrated only when no lower ceiling is
   requested. YOLO never authorizes publication and never weakens host, Git,
   credential, evidence, deletion, or branch-protection safety. Its private
   fallback is `empirical __internal yolo`.
6. Show any worktree proposal exactly and wait for approval before calling the
   approved creation operation. Never stash, force, or replace selected work.
   Once that exact proposal is approved and creation returns a handoff, the
   approval is sufficient to enter its path and resume its returned action;
   continue without asking for another confirmation or "go" message. If the
   host must restart or begin a new turn to change directories, resume the same
   durable action automatically when that lifecycle continues. Commit the new
   journal state before the tracker sync required below.
7. Treat Empirical's local journal as authoritative. If .empirical/tracker.json
   is absent or ticket behavior is off, remain local-only/off and make no
   provider requests. In manual mode use `empirical_tracker_bind` only for the
   user's explicit create or attach choice and never replace a binding
   implicitly. When tracker status includes `changeType` and
   `ticketRequirement`, follow that resolved rule. Required work validates a
   referenced ticket, reconciles the stable feature marker, or creates exactly
   once when no unique ticket exists. Optional work with one reference attaches
   it; optional work with no reference stays local with no credential/provider
   access and MUST NOT trigger a question about creating a ticket. Off work
   makes no provider request. Multiple references are a real ambiguity and
   require an exact choice; Empirical never guesses.
   After each local workflow mutation is durably committed, inspect the tracker
   policy. For Linear Policy v2 with `connection: "linear-mcp"`, call
   `empirical_tracker_linear_mcp_prepare` with the exact feature id, execute
   only its returned `linear.*` tool/arguments, submit the bounded normalized
   result through `empirical_tracker_linear_mcp_accept`, and repeat until
   synced. For every other policy, call `empirical_tracker_sync` with the
   action's exact feature id. Tracking publishes only configured milestone comments
   and receipt-approved safe evidence, preserves user-authored descriptions,
   and retries durable unacknowledged effects. Read effective `enforcement` and
   `gate` from every action. When a strict required gate is blocked, stop all
   source edits, evidence, handoff, and phase work; later mutation prompts may
   only report/retry the exact tracker recovery until a fresh action shows the
   gate open. Best-effort remote failure leaves local progress intact. Report
   local-only, off, synced, pending, or failed health truthfully.
   Tracker operations are granular MCP tools, not additional skills or user
   commands. OAuth authorization is out-of-band through negotiated URL mode.
   Raw credentials are never chat text or tool arguments/results. If OAuth is
   unavailable, tell the human `Never paste credentials into chat` and pause
   for direct host-file configuration at
   `${XDG_CONFIG_HOME:-$HOME/.config}/empirical/secrets.env` on POSIX or
   `%APPDATA%\Empirical\secrets.env` on Windows.
8. Execute every returned action. When a verification matrix is present, use
   `empirical_qa_plan`, run its applicable checks with
   `empirical_qa_execute` or record only an explicit applicable human step with
   `empirical_qa_record`, and keep retries/skips/missing environments visible.
   Use ordinary executed or collected receipts for compatible focused, browser,
   screenshot, and independent review evidence. Complete the exact revision with
   receipt ids, consume the response as the next action, and integrate reviewed
   capability deltas against an independent target. When Context is returned,
   call empirical_context, inspect repository evidence, replace every reported
   refinement-required topic, remove its managed marker, call empirical_context
   again, and complete only when stale, missing, and refinementRequired are all
   empty. When Review is returned, call `empirical_review` without a submission,
   honor bot setup-required guidance or start the required fresh isolated
   reviewer invocation, then record its packet-bound canonical result and use
   that receipt. A credential value is never a review tool input or chat text.
   If the user declines bot setup, call `empirical_configure` with review mode
   `fresh-context` and report that explicit fallback before preparing review;
   never degrade silently.
   When Deliver returns a source/evidence review-required packet, run the same
   isolated boundary on that exact remote base/head diff; request changes keep
   the PR draft and a new head requires a new packet. Report the exact highest
   completion level. Stop only at Done, Blocked, or Awaiting Human.
9. After Complex Specify passes, `empirical_handoff` may offer Continue here,
   Save for later, or one detected agent. Detection and Save launch nothing;
   another runtime requires explicit approval of its exact target, cwd, and argv.

Do not invent state, weaken acceptance criteria, expose credentials, or persist
private chain-of-thought. Files under .empirical/ are the durable source of truth.

Use Empirical MCP operations first. Use empirical __internal only when MCP is unavailable; it is a private agent fallback, never a command for the user to run.
