# Decisions: Dockside project filter

Record concise, externally reviewable evidence and choices here.

## D-001: Use live project data

Status: Accepted

### Evidence

Dockside already receives `PluginSidebarProject` objects and
builds ordered `ProjectThreadGroup` values before applying presets.

### Options

1. Hard-code `bbplugins`.
2. Add a free-text project input.
3. List live projects from BB.

### Chosen approach

Use option 3. This matches Cursor-style environment
selection and works when the project is renamed.

### Trade-offs and risks

Projects with no active group are not listed. This matches the
feature's active-inbox scope and avoids a selected filter with no visible data.

### Verification

Behavioral tests supply two project groups and prove project selection and All.

## D-002: Model preset and project filters as variants

Status: Accepted

### Evidence

Preset names and external project IDs share the Select component's
string value channel.

### Options

1. Add a nullable project ID beside the preset.
2. Overload one untyped string.
3. Use a discriminated union.

### Chosen approach

Use option 3 internally and namespaced strings only
at the Select boundary.

### Trade-offs and risks

A small encode/decode helper is required, but invalid mixed
states cannot enter the inbox logic.

### Verification

Typecheck proves exhaustive use and UI tests exercise encoded project options.

## D-003: Filter before host search

Status: Accepted

### Evidence

Dockside currently applies intent filters before host search.

### Options

1. Filter projects before host search.
2. Search all projects and filter the search result.

### Chosen approach

Use option 1. Search narrows the selected project and selecting
All restores the same ordered source groups.

### Trade-offs and risks

A selected project can disappear as active data changes.

### Verification

Exercise the stale-project reset in component behavior and verify it in BB.
