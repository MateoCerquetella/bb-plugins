# Decisions

## D-001: Use explicit violet over host inheritance

Status: Accepted

### Evidence

`plugins/aura/assets/icon.svg` and `plugins/steel-browser/assets/nav-icon.svg`
declare `stroke="currentColor"`, so the host text color decides whether they
render violet. The other branding icons already declare `#7c3aed` or force it
in an inline style.

### Options

Leave the icons host-colored; set `color` on a wrapper; declare `#7c3aed`
directly in each icon asset.

### Chosen approach

Declare `#7c3aed` directly on the icon strokes.

### Trade-offs and risks

The icons no longer adapt to monochrome host treatments, which is the requested
behavior.

### Verification

Render each changed icon and sample its strokes as `#7c3aed`; scan the branding
assets for remaining `currentColor` icon files.

## D-002: Delete Agent Canvas completely from the workspace catalog

Status: Accepted

### Evidence

Agent Canvas is unused and requires BB 0.44 and SDK 0.5.29 while the workspace
pins BB 0.40 and SDK 0.4.29. Its only live catalog references are
`.bb/plugins.json` and the root README.

### Options

Keep the plugin but hide it; remove only the catalog entry; delete the plugin
directory and all live references.

### Chosen approach

Delete `plugins/agent-canvas`, its `.bb/plugins.json` entry, its README row, and
its lockfile workspace packages. Keep historical Empirical records.

### Trade-offs and risks

Recovering the plugin requires git history. A retained entry would keep
offering an unwanted install, so full removal is safer.

### Verification

Run `npm install`, confirm the lockfile has no `bb-plugin-agent-canvas`, and
scan the live catalog, README, and workspace files for `agent-canvas`.

## D-003: Follow the marketplace content-addressed icon convention

Status: Accepted

### Evidence

Marketplace icon filenames are the SHA-256 prefix of their bytes
(`aura-5e185586.svg`, `steel-browser-95888c52.svg`) and entries reference that
exact file.

### Options

Overwrite an existing hash-named file; keep the old filename; write a new file
under its own hash and update the entry.

### Chosen approach

Write each violet asset under its new SHA-256 prefix and update the marketplace
entry URL. Keep BB Surf's ID, display name, source, tag prefix, and range.

### Trade-offs and risks

Each visual change produces a new asset file, which is exactly what makes the
published URL cache-bust.

### Verification

Run the marketplace build, confirm every changed icon reference resolves, and
sample the changed icons as `#7c3aed`.
