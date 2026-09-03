# Taskboard New Thread Drag To Composer

## Request

> Fix Taskboard on BB's root New Thread surface so users can reliably open Taskboard in the right panel instead of landing on an unavailable panel view. Add an explicit Taskboard affordance on New Thread if the current SDK supports it without fragile DOM coupling. Allow dragging a Taskboard ticket from the right panel into the currently visible composer—existing thread or New Thread—to insert the ticket as Taskboard's live external-work-item mention, focus the composer, preserve any existing draft and attachments, and never submit automatically. Preserve Kanban status drag behavior and provide an accessible non-drag equivalent. Add focused tests, build the plugin, install or move the local path installation to this checkout, reload it, and verify both existing-thread and New Thread flows live without publishing.

## Goal

Let a user keep Taskboard beside either an existing thread or BB's root New
Thread composer, then add an external ticket to that exact draft by dragging
or by an accessible button. The ticket is inserted as Taskboard's durable
mention, leaving the user in control of editing and submission.

## Acceptance Criteria

- [ ] [AC-1] Taskboard remains registered in both the existing-thread and root
  New Thread right-panel Actions lists, and selecting the New Thread action
  renders the constrained Taskboard for the composer's selected BB project.
- [ ] [AC-2] Dragging a visible List ticket from a Taskboard right panel onto
  the main composer inserts exactly one `external-work-item` mention for that
  ticket into the draft and focuses the composer.
- [ ] [AC-3] Dragging a Kanban ticket onto the main composer performs the same
  mention insertion, while dropping it on a valid Kanban lane continues to
  perform the existing provider-status move.
- [ ] [AC-4] Mention insertion preserves existing draft text, mentions, and
  file attachments and never sends, queues, steers, or creates a thread.
- [ ] [AC-5] Ticket detail exposes an accessible non-drag “Add to chat” action
  that inserts the same mention into the current existing-thread or New Thread
  draft.
- [ ] [AC-6] Drag payloads contain only the bounded Taskboard mention identity
  needed for insertion; malformed or unrelated drop payloads are ignored.
- [ ] [AC-UI-1] [UI] A compatible composer visibly indicates that it accepts
  the dragged Taskboard ticket, then shows the inserted ticket pill after the
  drop without navigating away.
- [ ] [AC-7] Focused automated coverage verifies payload validation, List and
  Kanban drag wiring, non-drag insertion, New Thread panel registration, and
  the absence of automatic submission behavior.

## Scope

- `plugins/taskboard/app.tsx` ticket presentation, right-panel composition,
  composer insertion, and New Thread panel registration.
- `plugins/taskboard/app.css` restrained drag-target feedback.
- Pure payload helpers and focused Taskboard tests.
- Taskboard README instructions for opening the root New Thread panel and
  adding tickets to drafts.
- Local build, path install/reload, and browser verification against the
  running compatible BB SDK.

## Non-goals

- Changing BB core's initial empty/stale right-panel tab selection. The Plugin
  SDK exposes the New Thread Actions registration but no imperative
  new-thread-panel opener; Taskboard will not click or query private host DOM.
- Automatically submitting a prompt or creating a thread after a drop.
- Changing provider status semantics, issue creation, tracker credentials, or
  mention resolution.
- Making full-page Taskboard List rows draggable into an unrelated route.
- Publishing, releasing, tagging, or pushing the plugin.

## Verification

- Run pure payload and source/UI contract tests for both view modes and the
  detail action.
- Run the Taskboard typecheck, complete test suite, production build, and build
  metadata verification.
- Move the existing local Taskboard path installation to this checkout only
  after confirming the build is not older than the running installation, then
  reload and inspect plugin status/logs.
- In a browser, open Taskboard from the right-panel Actions list on an existing
  thread and on root New Thread; exercise List and Kanban ticket drops and the
  detail “Add to chat” control; verify the draft is not sent and capture a
  screenshot.

## Capability Deltas

- `deltas/external-task-context.md` modifies Taskboard attachment so drag and
  button paths insert the existing live mention into the visible composer.
- `deltas/taskboard-browser.md` modifies constrained List/Kanban and detail
  presentation with composer handoff affordances while preserving status moves.
