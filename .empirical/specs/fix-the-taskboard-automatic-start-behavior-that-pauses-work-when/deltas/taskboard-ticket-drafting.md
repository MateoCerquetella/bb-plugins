# Taskboard Ticket Drafting

## Purpose

Define user-controlled AI refinement of draft ticket titles and descriptions
inside Taskboard's existing Create new ticket modal.

## MODIFIED Requirements

### Requirement: Improve an editable ticket draft with the current BB model

Taskboard SHALL offer an Improve with AI action when a selected project and
non-empty title or description are available. It SHALL send only those draft
fields to a hidden helper using the project's current provider/model defaults,
accept only a bounded structured title/description result, and replace the
editable fields without creating a ticket.

#### Scenario: Improve a rough ticket
- **WHEN** the user enters rough title or description text and selects Improve
  with AI
- **THEN** Taskboard shows an accessible in-progress state
- **AND** a valid helper result replaces both editable fields for review
- **AND** provider destination, status, assignee, labels and dates are unchanged.

#### Scenario: Preserve a draft after failure
- **WHEN** helper dispatch, execution, or structured parsing fails
- **THEN** the original title and description remain unchanged
- **AND** an actionable error and retry remain available.

#### Scenario: Cancel improvement
- **WHEN** the user cancels an active improvement or closes the modal
- **THEN** Taskboard stops or abandons the helper safely
- **AND** retains the current draft without creating a ticket.

#### Scenario: Compact creation modal
- **WHEN** Create new ticket is open at a compact viewport width
- **THEN** the improvement action and progress feedback remain reachable
- **AND** title, description, metadata controls and Create stay unobscured.

#### Scenario: Paste an image
- **WHEN** a user pastes a supported image into the creation modal
- **THEN** a removable preview appears
- **AND** Linear uploads finish before creating the issue
- **AND** unsupported destinations or failed uploads preserve the draft.

#### Scenario: Choose creation behavior
- **WHEN** the user selects Create only or submits the form
- **THEN** the new issue opens in Taskboard without agent dispatch
- **WHEN** the user selects Start now
- **THEN** creation succeeds before one explicit Factory start
- **AND** a failed start never retries issue creation.
