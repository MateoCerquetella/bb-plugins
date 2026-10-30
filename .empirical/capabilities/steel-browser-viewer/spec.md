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

The browser SHALL retain its two-second fine-pointer hover expansion and explicit Expand/Shrink/Escape controls. Ordinary composer and pane-splitter chrome SHALL NOT cover or intercept the expanded viewer. Both hover and pinned geometry SHALL remain within the viewport under supported UI zoom, leave at least a usable third of a desktop viewport unobscured when space allows, and retain the existing iframe and human input state. Leaving, blur, unmount and thread changes SHALL cancel pending hover behavior. Mobile SHALL use explicit controls without automatic hover expansion.

#### Scenario: Expanded viewer at non-default zoom

- GIVEN a desktop viewer at 125% UI zoom
- WHEN the pointer dwells for two seconds or the user explicitly expands it
- THEN its rendered width remains bounded by the intended viewport fraction
- AND its right and bottom edges remain inside the viewport
- AND the same iframe and its field contents survive the resize.

#### Scenario: Return to the thread

- WHEN the pointer leaves a hover-expanded viewer
- THEN the panel returns to compact mode
- WHEN Shrink or Escape is used
- THEN it stays compact until a new deliberate interaction.

#### Scenario: Chat chrome overlaps the expansion

- GIVEN the sidebar is in a stacking context below composer and splitter chrome
- WHEN the viewer expands over their area
- THEN hit testing within the expanded viewer reaches the viewer
- AND the uncovered chat remains interactive
- AND the existing iframe is not reloaded.


The sidebar SHALL show one panel expansion control and one reconnect action in its outer header. The inner viewer SHALL retain Copy/Paste without duplicate size/reconnect icons. Inline and plugin-page viewers SHALL retain their own complete toolbar.

#### Scenario: View an active browser in the sidebar

- WHEN the sidebar viewer is active
- THEN the outer header offers expansion and reconnect once
- AND the inner toolbar offers Copy and Paste
- AND there is no second full-viewport expansion mode.

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

### Requirement: Selectable verified-boundary Jev execution

BB Surf SHALL offer project-isolated Playwright, Jev and Auto policies.
Authorized Jev goals SHALL execute against the existing project Steel page.
URL-only tasks and explicit deterministic operations SHALL retain Playwright.
Terminal model status SHALL be validated and accompanied by a requirement for
independent outcome verification and clearly bounded timing.

#### Scenario: Jev completes
- GIVEN a configured authorized Jev runtime
- WHEN it finishes on the existing project page
- THEN BB Surf returns validated terminal status, action count and timing
- AND it does not claim independent verification or destroy the project page.

### Requirement: Fail closed at the execution boundary

BB Surf SHALL require explicit per-run paid authorization, private credentials,
and a valid runtime before dispatch. Fallback SHALL be opted-in and limited to
preflight. Cancellation and uncertain execution SHALL never replay actions.
The CDP bridge SHALL accept only authenticated bounded supported operations.

#### Scenario: Jev setup fails
- GIVEN fallback is enabled
- WHEN Jev fails preflight before dispatch
- THEN Playwright handoff includes a safe actionable setup reason.

#### Scenario: Runtime returns invalid output
- WHEN execution has started and output is malformed or non-terminal
- THEN BB Surf reports uncertainty and does not replay or claim success.

### Requirement: Use the existing BB viewer authentication

The embedded player and cast transport SHALL use locally authenticated plugin routes on the active BB app origin, resolving the saved project loopback binding on the server. The relay SHALL NOT forward BB credentials or accept a caller-selected upstream URL or CDP target.

#### Scenario: Viewer has no separate Connect browser session

- GIVEN the user can access BB and the saved project Steel browser is healthy
- WHEN the embedded viewer opens
- THEN the player and cast socket use the BB app origin
- AND no separate Connect OAuth login is required in an iframe.

#### Scenario: Untrusted origin or invalid target

- WHEN a foreign Origin accesses the HTTP or WebSocket viewer route
- THEN BB rejects the request
- WHEN a viewer request has no valid scope, references an unknown project, or supplies an invalid page target
- THEN it cannot reach an arbitrary service or expose CDP.

#### Scenario: Viewer lifecycle ends

- WHEN the viewer disconnects or its plugin is disposed
- THEN the associated upstream socket and pending buffers are released
- AND the project browser and profile remain running.
