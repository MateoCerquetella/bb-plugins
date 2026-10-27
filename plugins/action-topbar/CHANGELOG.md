# Changelog

## 0.1.4

- Restore native Action workspace panes on BB 0.46.1 with the included
  `patches/bb-0.46.1-action-drag.patch`. Official BB 0.46.1 and 0.47.1 builds
  no longer expose the experimental split-drag API to content scripts.
- The patched host opens Terminal, Browser, and plugin Actions as real
  main-workspace panes; edge drops split, center drops replace.
- Start Terminal from an Action pane creates the terminal for that thread
  instead of rendering an empty pane.

## 0.1.3

- Keep Action dragging working without BB's experimental split-drag API. The
  launcher now falls back to opening the Action in the pane under the pointer,
  or in the current pane on a click.
- Remove the misleading "Reload BB" status when a BB or SDK upgrade drops the
  experimental API.

## 0.1.2

- Restore Action dragging on BB 0.45.0 with the matching host frontend patch.
- Cancel active Action drags when the plugin frontend reloads.
- Add reproducible porting, build, backup, and rollback notes.

## 0.1.1

- Keep tab elements stable during live pane updates so pointer capture is not lost.
- Move an open Action tab's existing workspace pane through BB's native drag zones.
- Preserve the initiating pointer and source row during Action drags.
- Show a visible launcher status when the client lacks drag support or an Action is unavailable.
- Include a matching core patch for stock BB 0.44.0 with the GitHub release. The patch restores the experimental Action pane API required by this plugin.

## 0.1.0

- Initial Action Topbar Git release.
