# Action Topbar Distribution Delta

## MODIFIED Requirements

### Requirement: Installable experimental plugin source

The repository SHALL include the complete Action Topbar plugin source as an npm
workspace package under `plugins/action-topbar`, and a compatible BB client
SHALL expose the bounded host-owned Action-pane split-drag integration required
by that source.

#### Scenario: Drag an Action from the topbar on BB 0.45.0

- **GIVEN** Action Topbar is installed and enabled on the repaired BB 0.45.0
  client
- **WHEN** the user drags an Action row from the searchable topbar launcher to
  a valid thread workspace pane target
- **THEN** BB renders the Action in a host-owned pane at that target
- **AND** the launcher does not report that a reload is needed for drag support

#### Scenario: Cancel an Action drag

- **WHEN** the user cancels an engaged Action drag or the plugin generation is
  replaced
- **THEN** BB removes transient drag feedback and releases pointer state
- **AND** no partial Action pane or invalid split is persisted

#### Scenario: Run on an unsupported client

- **GIVEN** the content-script Action drag callback is absent
- **WHEN** the user attempts to drag an Action row
- **THEN** Action Topbar retains its bounded compatibility status instead of
  silently ignoring the interaction or executing plugin-owned panel content
