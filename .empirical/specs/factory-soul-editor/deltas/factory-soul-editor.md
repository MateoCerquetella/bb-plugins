# Factory Soul Editor

## Purpose

Give a BB user a focused, safe surface for reading and changing the prose each
Empirical Factory bot is told, while keeping code, tools, permissions, tickets,
and the rest of factory state outside the panel.

## ADDED Requirements

### Requirement: Dedicated Factory MCP soul panel
The plugin MUST run as an independently installable BB panel and SHALL use only
the Factory MCP tools `factory_status`, `factory_souls`, `factory_soul_set`, and
`factory_soul_audit`. It MUST NOT expose or call ticket, transcript, task,
board, message, or storage facilities.

#### Scenario: Panel opens with the Factory running
- **WHEN** the user opens Factory Souls from BB
- **THEN** the panel lists the bots returned by `factory_souls`
- **AND** the control order is orchestrator, sieve, helm, lens, warden, audit,
  lookback
- **AND** each row shows the bot name, a one-line non-heading summary, the soul
  character count, and the latest audit time when one exists.

#### Scenario: The MCP omits a bot
- **GIVEN** `factory_souls` returns fewer than seven bots
- **WHEN** the list renders
- **THEN** only returned bots appear
- **AND** the panel reports that the full expected set was not returned
- **AND** no missing bot is invented.

### Requirement: Read-only soul inspection
Selecting a bot MUST open its full soul in a monospace editor and SHALL show a
warning that this text is used on the next turn and that code, tools, and
permissions are separate. The panel SHALL display the bot's tool list from
`factory_status` when supplied and MUST label it read-only.

#### Scenario: Opening a soul
- **WHEN** a user selects a bot row
- **THEN** the full soul is visible in an editable monospace editor
- **AND** the next-turn warning is visible
- **AND** the author field, character count, and unsaved status are visible.

#### Scenario: Status has no per-bot tool list
- **GIVEN** `factory_status` returns no tools for the selected bot
- **WHEN** the detail view renders
- **THEN** it states that the tool list was not reported
- **AND** it does not derive a list from the soul or a local authority copy.

### Requirement: Two-step confirmed soul replacement
A soul write SHALL require the current soul, a non-empty edited soul, a
remembered non-empty author, a diff confirmation, and a second confirmation
that names the bot, requires typing the bot name exactly, and requires the
acknowledgment that the next turn uses this text.

#### Scenario: Reviewing a change
- **WHEN** the user presses Review on a changed soul
- **THEN** the panel shows the current and edited text as a diff
- **AND** it shows the exact character delta
- **AND** pressing Continue sends no write
- **AND** the second dialog names the bot and shows the session author.

#### Scenario: Incomplete confirmation
- **GIVEN** the diff confirmation is open or the typed name/acknowledgment are
  incomplete
- **WHEN** the user tries to save
- **THEN** the final Save control is disabled.

#### Scenario: Confirmed save
- **WHEN** the name matches exactly and the acknowledgment is checked
- **THEN** Save calls `factory_soul_set` once with the bot, full replacement
  text, and author
- **AND** no automatic retry follows a failure.

### Requirement: Save verification and audit proof
After `factory_soul_set` succeeds, the panel SHALL re-read `factory_souls` and
`factory_soul_audit` before claiming success. It MUST show the freshly stored
soul and the newest audit event for that bot.

#### Scenario: Verified save
- **GIVEN** the write succeeds and the re-read returns the new text
- **WHEN** the panel updates
- **THEN** the editor shows the stored text
- **AND** a verified-saved badge is visible
- **AND** the newest audit row shows author, time, and digest.

#### Scenario: Stored text differs
- **GIVEN** the write returns success but the re-read returns different text
- **WHEN** the panel updates
- **THEN** it reports that verification failed
- **AND** it does not show the verified badge.

#### Scenario: Re-read fails
- **GIVEN** the write succeeded but a souls or audit read fails
- **THEN** the panel shows the read failure without claiming verified success.

### Requirement: Draft and offline continuity
The panel SHALL keep a per-bot local draft labelled unsaved across navigation
and reloads, SHALL clear it only after verified save or explicit discard, and
SHALL present an unreachable Factory as a normal offline state with the start
command and a retry action.

#### Scenario: Navigation restores a draft
- **GIVEN** a changed, unsaved soul
- **WHEN** the user leaves the detail view and returns or reloads
- **THEN** the draft is restored
- **AND** it is labelled unsaved.

#### Scenario: Factory is down
- **GIVEN** the MCP returns a fetch/connection failure
- **WHEN** the panel loads or retries
- **THEN** it shows Factory is not running
- **AND** it shows the derived start command
- **AND** it does not present an error wall.
