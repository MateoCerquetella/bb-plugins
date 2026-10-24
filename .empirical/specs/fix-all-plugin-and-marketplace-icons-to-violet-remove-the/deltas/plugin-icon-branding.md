# Plugin Icon Branding Delta

## Purpose

Keep every plugin identity mark visually consistent with the violet BB Plugins
brand in both BB and the BB Community marketplace.

## ADDED Requirements

### Requirement: Plugin icons use the violet brand color explicitly

Every installable plugin's branding icon SHALL render in violet `#7c3aed`
without depending on the host application's current text color. Icons whose
paths currently inherit `currentColor` SHALL declare the violet color directly.

#### Scenario: Aura icon renders violet

- **GIVEN** Aura is installed
- **WHEN** BB renders Aura in its plugin list
- **THEN** the camera/spark mark is violet
- **AND** the icon does not inherit the surrounding text color

#### Scenario: BB Surf nav icon renders violet

- **GIVEN** BB Surf is installed
- **WHEN** BB renders BB Surf's sidebar and panel icon
- **THEN** the browser-frame nav icon is violet

### Requirement: The workspace no longer ships Agent Canvas

The repository SHALL NOT publish, catalog, or document the Agent Canvas plugin.
Its plugin directory, workspace entry, lockfile packages, and root README row
SHALL be removed while historical Empirical records remain untouched.

#### Scenario: A clean workspace install

- **GIVEN** a fresh clone after the removal
- **WHEN** the developer runs `npm install`
- **THEN** no `bb-plugin-agent-canvas` workspace is installed
- **AND** `.bb/plugins.json` lists only retained plugins
- **AND** the root README catalog has no Agent Canvas row

### Requirement: The local catalog offers no Agent Canvas source

Agent Canvas SHALL no longer be offered as an installable plugin from this
workspace.

#### Scenario: Installing from the local catalog

- **WHEN** BB reads `.bb/plugins.json`
- **THEN** no `agent-canvas` source is offered
