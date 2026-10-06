# Agent Canvas

A persistent spatial workbench for live BB agents, notes and connected context.

## Canvas

The square-grid canvas provides notes, text, freehand drawings, file trees,
agent templates and saved portal targets. Drag headers, resize using the corner
handle, or use arrow keys on the handles. Select multiple nodes with Shift-click
or a background marquee, then group, align, distribute, tidy, duplicate or save
an ensemble. Alt-drag duplicates the selected composition. Copies of agents
are templates: they require an explicit launch with a real provider and model.

Pan with wheel/trackpad scrolling, Space-drag or middle-drag. Alt-wheel and
pinch zoom around the pointer; zoom controls, Fit and a viewport minimap are
available. Lock prevents geometry changes; Blur hides contents; double-click
a header lifts the node, with left/right docking. Narrow screens stack nodes.
Keyboard activation of insertion tools creates a node in the visible area.
Settings lists shortcuts and configurable grid/default node sizes.

Authored connections are solid; recorded parent/browser ownership connections
are dashed. Creating a connection sends no message. Groups, roles, note
collections, ensembles and undo/redo belong to the validated document.
Settings exports/imports a bounded versioned JSON backup. Ensemble placement
remaps IDs and preserves connections and groups without copying running threads.

The document is stored server-side with revision checks. Conflicting edits
retain a local draft and offer backup/export and shared reload. Earlier local
layouts and pre-shared/conflict backups remain in browser storage.

## Agents and shared context

Visible conversations use native BB `ThreadChat`, including its composer,
attachments and permission handling. Off-screen chats suspend their rendering.
New agents use BB's native provider/model/environment picker. Role instructions
are included in the launch prompt. Roles can be assigned from node actions;
Send role instructions explicitly sends them to an existing conversation.
Dynamic role instructions/tools take effect when BB constructs the next provider
session, rather than changing an existing runtime silently.

Notes explicitly linked to a thread in the same project are accessible through
`agent_canvas_notes` and `agent_canvas_write_note`. Each call rechecks the live
thread and current links; unrelated notes and hidden/deleted identities are denied.
Note contents are context, not system instructions.

A thread assigned a Maestro role receives `agent_canvas_team`. It can inspect,
recruit, reassign or stop direct teammates for user-authorized coordination.
Recruitment inherits the Maestro's provider, model, permissions and environment.
Reassignment and dismissal require a real direct parent relationship in the same
project. Dismissal requests a stop and preserves the conversation. Node actions
also provide explicit recruitment, role sends and stopping through native BB APIs.
No recruitment runs merely because a canvas opens or a link is created.

## Floors and resources

Workspaces and floors include actual BB projects/environments, including empty
floors. New isolated floor uses the native composer to create its initial agent
on a new worktree. Review floor loads real uncommitted changes and pull request
status and offers the native BB surface for full review and landing actions.
File trees search the chosen environment and preview UTF-8 files up to 200 KB.
Saving checks the original file hash and binds access to the environment root.

Existing verified automation tabs support visible captures every three seconds,
with pause, refresh and timestamp. Capture authorization rechecks thread, host,
generation and automation profile. These are visual captures. Saved portal nodes
currently store a URL; project Steel navigation/interaction is still outstanding.

Other outstanding parity work includes routines, terminal surfaces, connected
composer mentions and full library transfer controls. The authoritative inventory
is `.empirical/specs/agent-canvas-maestri-parity/parity.md`; this implementation
checkpoint does not establish complete Maestri parity.

## CLI and development

`bb agent-canvas status --json` reads the bounded graph. The retained selected
Control identity can use acknowledged visual commands through
`bb agent-canvas ui '{"action":"fit"}'`. No Control dock is displayed.
Thread/browser discovery is bounded and reports partial coverage explicitly.

From the workspace root:

```sh
npm install
npm run check
bb plugin install --yes ./plugins/agent-canvas
bb plugin reload agent-canvas
bb agent-canvas status --json
```

The plugin pins the SDK shipped with its own pinned BB release. Builds and SDK
checks clear `BB_CLI` to avoid repinning against the currently running agent host.
