# Design

## Data model

Represent the active filter as a discriminated union:

- `{ kind: "preset"; preset: ThreadFilterPreset }`
- `{ kind: "project"; projectId: string }`

The union prevents project IDs from being mistaken for preset values. The
select component serializes each union member to a namespaced string at its UI
boundary and parses only values derived from the supplied options.

## Data flow

`ThreadInbox` builds its complete, ordered project groups first. It passes those
groups and the active filter to one pure filtering function. Presets keep their
existing family-level behavior. A project selection keeps the matching group
unchanged. Host search continues to run after this filter.

`FilterMenu` receives the complete active project list, renders it in a Projects
section after the existing preset groups, and displays either the preset label
or selected project name in its trigger.

## UI behavior

ThreadLocation renders branch and host as independent optional values in its
existing flex row. The host has a bounded width and title; the branch truncates
in the remaining space. Both root and child callers reuse this component.

The existing filter icon remains the only toolbar control. Selecting a project
shows its name beside the icon using the current active-filter styling. The
menu remains compact and uses BB's existing Select components, labels, and
keyboard behavior.

## Boundaries

- No project name is hard-coded.
- The project ID remains the selection identity.
- A project that disappears from the active groups resets the filter to All.
- Selection mode continues to preserve selected families through its existing
  complete-group source.

## Verification

Behavioral tests exercise project scoping, restoration through All, missing
projects, and unchanged preset behavior. The UI contract checks the project
section, namespaced select values, active label, and inbox wiring. Typecheck and
the full Dockside test suite guard component integration.
