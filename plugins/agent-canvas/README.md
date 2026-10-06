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
Settings exports/imports a bounded versioned JSON backup. Ensembles and reusable note collections also export/import separate versioned libraries, preserving roles, groups and cables with new IDs. Ensemble placement
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
Note contents are context, not system instructions. Connected notes appear under @ in the native composer; signed mention identities are revalidated against their source connection and fetch fresh contents at send time. Mentions are explicit user-provided context; agent-tool access stays bound to the calling thread.

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
on a new worktree using the registered `git-worktree` environment provider. Review floor loads real uncommitted changes and pull request
status and offers the native BB surface for full review and landing actions.
File trees search the chosen environment and preview UTF-8 files up to 200 KB.
Saving checks the original file hash and binds access to the environment root.

Existing verified automation tabs support visible captures every three seconds,
with pause, refresh and timestamp. Capture authorization rechecks thread, host,
generation and automation profile. These are visual captures. Portal nodes navigate the actual project Steel session and embed its interactive viewer after confirmed navigation. All portals in a workspace share that browser; BB Connect and website authentication happen in the embedded viewer. The portal requires Steel Browser with the new `navigate` RPC shipped in this branch.

Thread terminal view chooses a real BB PTY or creates one explicitly, renders
it with xterm, sends real input, and synchronizes size. It is a separate shell
on the thread's environment; it does not impersonate the provider's private
agent runtime. Off-screen views suspend polling without killing the process.
Terminal process IDs are not stored in exported compositions.

Routines use BB's native Automations service, target an existing agent, and
inherit its execution configuration when saved. Create a paused routine, then
activate explicitly; edit, pause/resume, and delete controls use native records.
Sequential prompt chains separated by `&&` are still outstanding.

Other outstanding parity work includes search refinements, sequential routine
chains and complete host/live-UI verification. The authoritative inventory
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
