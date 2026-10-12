# Steel Browser Viewer Delta

## MODIFIED Requirements

### Requirement: Render the viewer for every human browser handoff

Steel SHALL instruct agents to emit `::steel-browser{}` on its own line in the
same assistant message whenever they ask the user to interact with the browser.
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
