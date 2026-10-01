# Agent Canvas

## Request

> Create a new BB plugin named Agent Canvas based closely on the supplied reference screenshot. Build a full-screen dark spatial canvas with draggable/resizable live thread panes using native ThreadChat, a persistent Coordinator native chat docked on the right, a compact workspace tab strip and add control, dotted background, minimap, zoom/fit/reorganize controls, and pane title/status metadata. Coordinator selection or creation must be an explicit user action through native BB controls; never autonomously spawn or message agents. Use current public Plugin SDK surfaces, preserve authorization and permission modes, persist bounded canvas layout safely, provide keyboard and narrow-screen fallbacks, add the package to the workspace catalog, install/reload it locally, and verify the visual experience against the screenshot without copying AgentGrid branding or proprietary assets.

## Goal

Give a multi-project BB operator one spatial control room: live threads appear
as readable, movable panes on a dark canvas while one persistent Coordinator
conversation stays available at the right edge.

## Acceptance Criteria

<!-- Replace this comment with observable criteria such as:
- [ ] [AC-1] The user can complete the intended action.
- [ ] [AC-UI-1] [UI] The result is visible in the browser.
-->

- [ ] [AC-1] The plugin opens as a BB-themed spatial canvas with a dotted
  background, workspace tabs, and a colored square for each project workspace.
  Worktrees remain filterable; a minimap, zoom, reset, fit, and reorganize controls are available.
- [ ] [AC-2] Authorized existing threads appear as bounded panes showing title,
  project/worktree context, provider/model, and semantic live state. Visible panes
  mount streaming native `ThreadChat` timelines with inherited permission behavior.
  BB child-thread and verified browser ownership relationships appear as edges.
- [ ] [AC-3] The user can drag panes freely beyond workspace squares in all
  directions, resize them within safe bounds, focus one
  pane, and persist/recover layout positions without exposing arbitrary paths or
  secrets. Ctrl/Command-wheel, touch/trackpad pinch, animated zoom controls,
  and keyboard navigation preserve a usable canvas. Space-drag, middle-drag,
  and an explicit pan tool allow navigation over live panes. Fit includes
  displaced panes; signed positions survive reload.
- [ ] [AC-4] A right-side universal Control dock mounts one native conversation
  across all workspaces with a server-persisted identity. Explicit bounded UI
  tools navigate the mounted canvas and report acknowledgements or uncertainty.
  Selection and creation remain explicit; the plugin never autonomously spawns
  or messages agents.
- [ ] [AC-5] The canvas remains usable at narrow widths and with keyboard
  navigation; on small screens it switches to a stacked pane list and keeps
  Coordinator access visible.
- [ ] [AC-6] Loading, stale/disconnected, permission/error, empty, and removed
  thread records render recoverable states without crashing. Lifecycle events
  refresh agent state independently of browser discovery. Available automation
  tabs support bounded periodic captures with timestamps, pause controls,
  verified ownership, and explicit unavailable/stale states.

## Scope

One installable plugin package with a nav-panel canvas, bounded server
projection of visible projects, environments, hosts, and threads, native
ThreadChat panes, persisted layout state, and a native composer for explicit
Coordinator selection/creation.

## Non-goals

No embedded terminals or interactive browser streams, autonomous orchestration, cross-thread
broadcasting, hidden permission escalation, arbitrary filesystem browsing,
AgentGrid branding/assets, or an unbounded infinite-canvas data model.

## Verification

Build and typecheck against the pinned SDK; focused projection/layout tests;
install/reload in BB; browser screenshots at desktop and narrow widths in light
and dark themes; verify drag/resize persistence, native chat identity,
Coordinator selection, empty/stale states, and keyboard fallback without
creating or messaging a real agent during automated checks.

## Capability Deltas

Create one or more files under deltas/<capability>.md using ADDED, MODIFIED, or
REMOVED Requirements sections, named Requirement blocks, and concrete Scenario
examples. These merge into living specifications
after verification and review.
