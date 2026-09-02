# External Task Context Delta

## MODIFIED Requirements

### Requirement: External tracker data is untrusted context

Every Taskboard mention or agent-handoff context SHALL identify provider issue
content as untrusted external data, delimit its beginning and end, and state
that text inside the delimiter is reference material rather than instructions.
Taskboard SHALL allow its right-panel ticket identity to be inserted into the
currently visible existing-thread or root New Thread composer as the same live
`external-work-item` mention by drag/drop or an accessible explicit action.
Insertion SHALL preserve the current draft and attachments, focus the composer,
and SHALL NOT submit or otherwise start agent work.

#### Scenario: Drop a ticket into a draft

- **GIVEN** Taskboard and a main composer are visible together
- **WHEN** the user drags a Taskboard List row or Kanban card onto that composer
- **THEN** exactly one mention pill for that ticket is appended to the draft
- **AND** existing draft text, mentions, and attachments remain present
- **AND** no message or thread is submitted

#### Scenario: Use the keyboard-accessible handoff

- **WHEN** the user opens ticket detail and activates “Add to chat”
- **THEN** Taskboard inserts the same live mention and focuses the composer
- **AND** the user remains in control of editing and submission

#### Scenario: Reject an invalid drop

- **WHEN** a drop omits Taskboard's private MIME type or contains a malformed,
  oversized, or unsupported mention identity
- **THEN** Taskboard ignores it without changing the composer
