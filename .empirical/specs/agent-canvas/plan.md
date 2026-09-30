# Agent Canvas Plan

1. Add an independent plugin package with public SDK-pinned manifest,
   projection RPC, CLI status command, and catalog/README entry.
2. Build the canvas shell and styles: workspace strip, dotted field, pane
   headers, drag/resize gestures, minimap, zoom controls, and responsive
   stacking.
3. Mount native `ThreadChat` for every visible pane and explicit
   `NewThreadComposer` for Coordinator creation; persist only validated ids and
   geometry.
4. Run typecheck/build, install/reload in BB, inspect the live route at desktop
   and narrow widths, and record limitations honestly.
