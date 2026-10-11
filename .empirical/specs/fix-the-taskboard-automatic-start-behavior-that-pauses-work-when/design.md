# Design

## Creation refinement

Keep images as bounded data URLs in the modal until submit. Validate image
signatures on the server and upload using the selected Linear adapter before
issuing create. Use an optional adapter capability so other providers fail
explicitly without changing text-only creation. Snapshot clipboard on the
composer action click, not in a background listener; existing SDK attachments
are not readable. Use a synchronous submit ref to prevent double clicks.
Separate create and post-create start/navigation error handling so a start
failure cannot enable issue recreation. Default form submit is Create only.

## Progress redesign

Keep Factory lifecycle unchanged. Add a bounded `factoryDiff` RPC keyed by the
Factory identity, run id and reported path. The server verifies that the run,
environment and path belong to the durable record, then calls BB's environment
`diffPatch` API with the `all` target and a per-file byte cap. The browser never
chooses arbitrary environment ids or filesystem paths.

Render the selected patch through the SDK-owned `experimental_Diff` component
in unified mode. File selection is a compact list with explicit loading, empty,
binary/truncated and unavailable states. Do not synthesize patches from agent
messages or path lists.

Share themed run insights between the task detail and native header dialog.
Use one current-run heading and activity block. Group commands and updates in
closed native details with counts and bounded output. Earlier runs stay as
compact summary rows until expanded. Use BB semantic tokens at each root so
portaled dialogs inherit correctly.

Animate only the active status glyph and newly arrived progress content, using
short opacity/translation changes inspired by Dockside. All animation is
scoped to `prefers-reduced-motion: no-preference`. Use the existing encoded
ticket route for Original ticket. Remove pin callbacks from work navigation
entirely; preserve explicit user pin controls. Polling must not downgrade
record versions.

## Current failure

`startTask` recognizes a finished repair Build but calls `advance`. A blocked
result makes `advance` reconstruct the same automation error, so no new native
turn starts. Separately, native `turn/started` clears run result fields but not
the record-level automation error.

## Approach

1. Add a `resumeBlockedBuild` service helper that validates the current plan,
   scope, original Build thread, managed environment, and idle session.
2. Reuse `dispatch` with an explicit continuation link so dispatch persists a
   new Build run before calling `threads.send`; never spawn a replacement.
3. Extend the Build prompt with the prior structured blocker summary and
   instructions to finish actionable scope while preserving repository gates.
4. Route explicit `startTask` and the Build action through this helper.
   Automatic polling continues to pause on a blocked Build.
5. Clear a Build-result-derived automation error when a later native Build turn
   starts, while retaining scope/workspace/uncertainty errors.

## Data and compatibility

Use existing `repairOf` linkage for review repair only and add a nullable
`continuationOf` run field with schema default `null`. Existing stored records
remain readable. Active-run locking and the durable starting record provide
idempotence.

## Verification

Add RPC tests for authorized patch lookup, unknown paths, missing environments
and unavailable host results. Add UI source/browser checks for the host diff
component, file selection, compact earlier-run summaries, collapsed evidence
and reduced-motion CSS. Run focused Taskboard tests, typecheck, build and visual
checks at wide, panel and phone widths in light and dark themes.

## Ticket improvement

Add a typed start/status/cancel RPC with request UUIDs and plugin-owned KV
records. Persist dispatch intent before spawning a standalone hidden helper.
Use project default execution settings without inheriting transcript or
elevating permissions. Validate a JSON title/description pair; never execute
the draft or call a tracker mutation from the improvement service.

The modal locks draft fields and Create while improving, polls bounded status,
and cancels on close/scope change. An epoch/ref guard ignores late responses.
Undo restores the original pair; editing invalidates Undo. Archive only known
owned helper threads and stop on cancellation/timeout.

Add service tests for same-thread resume, prompt evidence, concurrency,
workspace rejection, successful continuation to review, repeated blocking, and
new-turn stale-error cleanup. Run focused and full Taskboard checks.
