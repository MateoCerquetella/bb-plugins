# Agent Canvas Design

## Information architecture

The nav panel is split into a large canvas region and a fixed Coordinator
region. A top strip names the workspace and offers a non-destructive add
control. The canvas holds bounded pane shells; each shell delegates transcript,
composer, permissions, and streaming to native `ThreadChat`.

## State and persistence

The server returns only authorized, bounded thread metadata. The client keeps
canvas geometry and Coordinator identity in validated browser storage. Pointer
gestures update only geometry; selecting a thread never sends a message.

## Responsive behavior

At narrow widths panes become a vertical stack and Coordinator follows below
the canvas. Desktop uses absolute positioning for spatial navigation. Controls
remain semantic buttons with labels and keyboard focus.

## Verification hooks

The package uses a public RPC projection, explicit `threads.spawn` only from
the native composer, and a live smoke route that can inspect pane count and
page errors without creating a real thread.
