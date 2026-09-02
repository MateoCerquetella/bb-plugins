# Decisions: Taskboard New Thread Drag To Composer

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- Taskboard already registers both existing-thread and New Thread panel actions.
- Live BB 0.41 / SDK 0.4.34 opens Taskboard from the root right-panel Actions
  list, while an initially restored empty tab can show the host-owned
  “unavailable” state.
- `useComposer().insertMention` is the supported durable attachment primitive
  and preserves existing drafts and attachments.
- The SDK has no imperative New Thread panel opener; `openThreadPanel` is
  explicitly thread-only.
- Kanban already owns an HTML drag gesture for status changes.

### Options

1. Use bounded native drag data plus the route-bound composer controller, and
   preserve the supported New Thread Actions registration.
2. Add a content script that finds and clicks BB's right-panel controls.
3. Drop plain ticket text into the editor and bypass the mention provider.
4. Replace Kanban's status drag gesture with a composer-only drag gesture.

### Chosen approach

Choose option 1. Add one strict private MIME payload, constrained-source drag
wiring, semantic composer-target detection, live mention insertion, and a
detail-level **Add to chat** button. Keep the New Thread action registration as
the supported opening path.

### Trade-offs and risks

- The first New Thread panel open still goes through BB's host-owned right-panel
  launcher. Taskboard cannot safely replace a stale/empty host tab with the
  current SDK, so the README makes the supported path explicit.
- Native drag has no keyboard equivalent; the detail button provides one.
- Multiple drag meanings on Kanban can be confusing. `copyMove`, visible
  composer feedback, and unchanged lane feedback distinguish the targets.
- Drag payloads are untrusted browser data. Strict parsing, exact provider
  checks, string bounds, and exclusion of external issue prose keep them safe.

### Verification

- Pure payload tests.
- Focused source/UI contract tests.
- Taskboard workspace checks and production build verification.
- Live existing-thread and New Thread panel/drop/button checks with screenshot.
