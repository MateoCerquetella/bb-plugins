# Steel Browser Viewer Specification

## Purpose

Keep project-isolated Steel viewers reachable through authenticated BB Connect
without treating local browser health as proof of viewer transport readiness.

## Requirements

### Requirement: Recover missing viewer shares

Steel SHALL check the host-specific BB Connect viewer share before marking a
healthy saved binding ready, restoring a missing API share only after validating
the dedicated container. It SHALL preserve the binding, profile and sessions,
never expose CDP, and fail closed on mismatched origins or Connect errors.

#### Scenario: Healthy browser loses its viewer share

- **GIVEN** the API and CDP are healthy but the viewer share is absent
- **WHEN** readiness is checked after the short cache expires
- **THEN** the validated API port is shared on the Steel host
- **AND** the returned origin must match the saved viewer origin
- **AND** no container is restarted or profile replaced

#### Scenario: Share recovery fails

- **WHEN** container validation or BB Connect fails
- **THEN** readiness reports the failure without caching success
- **AND** a later request can retry

### Requirement: Render the viewer for every human browser handoff

Steel SHALL instruct agents to emit `::steel-browser{}` on its own line in the
same assistant message whenever they ask the user to interact with the browser.
This includes credential entry, sign-in, MFA, consent, or any other manual step.
Agents SHALL NOT refer to an embedded browser "above" unless the current
response contains the directive. This requirement SHALL be present in both the
always-injected plugin instructions and the bundled Steel skill.
On desktop clients the directive SHALL load the inline viewer automatically. On
phone-width or coarse-pointer clients the directive SHALL initially render the
viewer minimized without requesting its iframe URL, and SHALL load it only
after the user explicitly restores it.

#### Scenario: Mobile handoff waits for the user

- **GIVEN** a Steel directive is rendered on a phone-width or coarse-pointer client
- **WHEN** the message first appears
- **THEN** the inline browser is minimized
- **AND** no viewer iframe or viewer URL request is created
- **AND** an accessible restore control is visible

#### Scenario: Mobile user opens the viewer

- **GIVEN** the mobile inline browser is initially minimized
- **WHEN** the user activates Restore inline browser
- **THEN** the authenticated viewer iframe loads in the message
- **AND** the normal viewer controls are available

#### Scenario: Desktop handoff remains automatic

- **GIVEN** a Steel directive is rendered on a desktop client
- **WHEN** the message first appears
- **THEN** the authenticated inline viewer loads automatically

#### Scenario: Website requires sign-in

- **GIVEN** the agent has navigated the project Steel session to a sign-in page
- **WHEN** the agent asks the user to enter credentials
- **THEN** that same assistant message contains `::steel-browser{}` on its own line
- **AND** BB renders the native inline Steel viewer with the request
- **AND** the agent does not request credentials in chat

#### Scenario: Viewer authentication is unavailable

- **WHEN** the native directive renders but BB Connect authentication blocks it
- **THEN** the agent reports that limitation
- **AND** the agent does not open an external browser or expose a viewer URL

#### Scenario: Website requires MFA after an earlier viewer message

- **GIVEN** an earlier assistant message rendered the Steel viewer
- **WHEN** a later response asks the user to complete MFA or another manual step
- **THEN** the later response repeats `::steel-browser{}` on its own line
- **AND** the user is not told to use an absent or stale browser surface

### Requirement: Expand the live right panel without a modal

The browser SHALL offer the host right thread panel through its Monitor icon and an Open browser panel button in each handoff. A fine pointer dwelling for 2000ms SHALL expand the visible panel toward the viewport width without a backdrop or focus trap. Pointer leave SHALL restore a hover expansion. Explicit Expand/Shrink and Escape SHALL be available, and the same iframe SHALL survive resizing. Mobile SHALL use explicit controls without automatic hover expansion. Timer cleanup SHALL prevent expansion after leave, blur, unmount or thread change.

#### Scenario: Watch an agent and return to chat

- **WHEN** the user opens the browser panel and hovers for two seconds
- **THEN** the existing project viewer expands with BB theme styling
- **AND** leaving restores the compact view without restarting the viewer or browser

#### Scenario: Short hover or keyboard use

- **WHEN** the pointer leaves before two seconds
- **THEN** no expansion occurs later
- **WHEN** the user activates Expand, Shrink or Escape
- **THEN** the panel changes size predictably without trapping focus

### Requirement: Personalized browser presentation

User-facing plugin navigation and viewer headings SHALL use Cerq Browser unless the user supplies another name, while steel-browser installation IDs, CLI commands and message directives SHALL remain compatible.

#### Scenario: Existing browser task

- **WHEN** an agent uses bb surf project and emits ::steel-browser{}
- **THEN** the existing bound browser remains visible through the personalized UI

### Requirement: Bounded panel hover work

The automatic hover sampler SHALL run only while automatic hover expansion or
collapse is possible.

#### Scenario: User pins the expanded panel

- **WHEN** the user explicitly expands BB Surf
- **THEN** the panel remains expanded until explicit shrink or Escape
- **AND** the automatic hover sampling interval is not active

#### Scenario: User returns to compact mode

- **WHEN** the user shrinks the pinned panel
- **THEN** the compact panel resumes the existing hover sampling behavior

### Requirement: Surf command identity

BB Surf SHALL register `surf` as its public top-level CLI command. The plugin
SHALL preserve the `steel-browser` plugin ID, package name, storage keys,
project browser bindings, UI route, and `::steel-browser{}` handoff directive.
User-facing command guidance SHALL use `bb surf`. Steel SHALL remain the name
of the upstream browser engine and service.

#### Scenario: User opens command help

- **WHEN** the user runs `bb surf --help`
- **THEN** BB lists the existing browser subcommands
- **AND** the help identifies BB Surf as the browser command

#### Scenario: Existing project browser is reused

- **GIVEN** a project already has a browser binding stored by the
  `steel-browser` plugin
- **WHEN** the user runs `bb surf project`
- **THEN** the existing binding and browser profile are reused
- **AND** no persistent data migration is required

#### Scenario: Agent requests browser work

- **WHEN** an agent receives a browser task
- **THEN** its injected instructions and bundled skill direct it to
  `bb surf project`
- **AND** visible browser handoffs still emit `::steel-browser{}`
