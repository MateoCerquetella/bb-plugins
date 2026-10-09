# Decisions: Resume Blocked Taskboard Builds

## D-007: Explicit creation and native image delivery

Status: Accepted

### Evidence
The pinned composer exposes only attachmentCount, not attachment bytes.
Linear supports signed file uploads and Markdown image references.

### Options
1. Scrape composer internals and publish images through an unrelated host.
2. Use gesture clipboard reads and direct paste, with Linear native uploads.

### Chosen approach
Option 2, with explicit fallback when existing composer images cannot be read.
Create only is default; Start now calls Factory only after issue creation.

### Trade-offs and risks
Clipboard permission may be denied. Other providers lack an upload capability
and reject image-bearing creation explicitly. Successful uploads may remain
orphaned if issue creation fails. A lost creation response must not be retried.

### Verification
Validate image bounds/signatures, preserve drafts on errors, and check both
submit actions with duplicate-click and post-create start failures.

## D-003: Standalone ticket drafting helper

Status: Accepted

### Evidence

Improve Prompt uses hidden helpers and editable replacement. Taskboard has a
typed RPC and existing project default execution API.

### Options

1. Depend on the separately installed Prompt Improver plugin.
2. Own a small standalone helper lifecycle inside Taskboard.

### Chosen approach

Option 2 keeps Taskboard independently installable. Use project defaults, a
bounded JSON result, cancel and Undo, without automatic issue creation.

### Trade-offs and risks

Persist intent and cancellation across restart; never blindly retry uncertain
spawn. Ignore stale modal responses and retain drafts on invalid output.

### Verification

Parser, lifecycle and UI contract regression tests; later browser verification.

## D-001: Require explicit same-session continuation

Status: Accepted

### Evidence

The supplied result combines actionable implementation defects with genuine
unanswered policy and repository tracker gates. Current Start task re-evaluates
that result and pauses again without sending a native turn.

### Options

1. Retry every blocked Build automatically.
2. Never resume a blocked Build.
3. Resume only after explicit Start task, in the original Build session.

### Chosen approach

Option 3. Validate current scope, approval, Build thread and managed environment,
then persist and send one continuation to the same thread. Polling does not
initiate blocked-Build recovery.

### Trade-offs and risks

One click is required. This avoids loops and never chooses policy for the user.
Persist dispatch intent before sending and preserve uncertain outcomes.

### Verification

Test same-thread resume, concurrent starts, workspace rejection, repeated
blocking, successful continuation to review, and stale pause cleanup.

## D-002: Track continuation separately from review repair

Status: Accepted

### Evidence

`repairOf` controls the bounded independent-review repair cycle; a
user-requested continuation of a blocked Build has different semantics.

### Options

1. Overload `repairOf`.
2. Add a backward-compatible nullable `continuationOf` run field.

### Chosen approach

Option 2 with schema default `null`, preserving existing records and review
repair limits.

### Trade-offs and risks

The wire record grows by one field, but prompts and state transitions retain
unambiguous provenance.

### Verification

Contract parsing and store reload tests cover legacy and continued runs.
# D-004 Native progress surfaces

Use the existing header action and dialog, not injected thread DOM. Existing
ticket detail routing preserves provider permissions and comments. Remove
navigation pin side effects rather than changing the user's manual pin setting.
Verify collapsed commands, semantic status and encoded routes with focused tests
and compact/light/dark browser inspection.

## D-005: Use BB's native diff renderer with server-authorized patch lookup

Status: Accepted

### Evidence

Taskboard already pins an SDK that exports `experimental_Diff` and an
environment API that provides bounded per-file patches. The existing UI stores
only agent-reported paths and currently renders them as a list.

### Options

1. Show the path list only.
2. Parse and style `git diff` output inside Taskboard.
3. Verify the durable run/path server-side, fetch the environment patch, and
   delegate presentation to BB's host-owned diff component.

### Chosen approach

Option 3. Add a typed RPC accepting Factory identity, run id and one path. The
server rejects paths not reported by that run and environments not attached to
it, then returns a capped patch or a typed unavailable reason. Render unified
diffs through `experimental_Diff`.

### Trade-offs and risks

The experimental SDK surface is version-pinned and may evolve, but it preserves
BB syntax colors, accessibility and renderer overrides. Workspace drift can
make a previously reported path unavailable, which remains visible as an honest
state rather than cached or fabricated content.

### Verification

Contract/service tests cover authorization and unavailable results. Browser
checks cover selection, renderer output, compact overflow and themes.

## D-006: Restrict animation to live status

Status: Accepted

### Evidence

Dockside uses a small rotating work mark and short arrival animation, guarded
by `prefers-reduced-motion`. Broad animation would compete with dense evidence.

### Options

1. Keep progress entirely static.
2. Animate the entire progress panel or phase track.
3. Animate only the live status glyph and new activity arrival.

### Chosen approach

Animate only the live glyph and newly arriving activity. Historical, blocked,
failed and completed content remains still. Reduced-motion disables all
nonessential animation.

### Trade-offs and risks

The motion is intentionally subtle and may not be the sole signal of work, so
the text status and `aria-live` announcement remain authoritative. Animation
must stop promptly when the run leaves a live state.

### Verification

Source assertions and browser inspection cover live/non-live and reduced-motion
states.
