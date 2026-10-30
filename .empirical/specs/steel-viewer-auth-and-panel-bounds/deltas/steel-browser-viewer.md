## ADDED Requirements

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

## MODIFIED Requirements

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
