# Steel Browser Viewer Delta

## ADDED Requirements

### Requirement: Render the viewer for every human browser handoff

Steel SHALL instruct agents to emit `::steel-browser{}` on its own line in the
same assistant message whenever they ask the user to interact with the browser,
including credential entry, sign-in, MFA, consent, or any other manual step.
Agents SHALL NOT refer to an embedded browser "above" unless the current
response contains the directive. This requirement SHALL be present in both the
always-injected plugin instructions and the bundled Steel skill.

#### Scenario: Website requires sign-in

- **GIVEN** the agent has navigated the project Steel session to a sign-in page
- **WHEN** the agent asks the user to enter credentials
- **THEN** that same assistant message contains `::steel-browser{}` on its own line
- **AND** BB renders the native inline Steel viewer with the request
- **AND** the agent does not request credentials in chat

#### Scenario: Website requires MFA after an earlier viewer message

- **GIVEN** an earlier assistant message rendered the Steel viewer
- **WHEN** a later response asks the user to complete MFA or another manual step
- **THEN** the later response repeats `::steel-browser{}` on its own line
- **AND** the user is not told to use an absent or stale browser surface

#### Scenario: Viewer authentication is unavailable

- **WHEN** the native directive renders but BB Connect authentication blocks it
- **THEN** the agent reports that limitation
- **AND** the agent does not open an external browser or expose a viewer URL
