# Design

## Architecture
Continue the existing installed Agent Canvas inside this feature checkout. Preserve its snapshot contract, live ThreadChat virtualization, browser-capture authorization and acknowledged Control tools. Add a validated canvas document containing authored nodes, thread presentation metadata, authored edges, groups, roles, ensembles, collections and per-workspace viewport state. Keep recorded BB relationships in the snapshot, distinct from authored document edges.

Use pure document operations for geometry, snapping, alignment, group movement, duplication and import/export. The UI holds a bounded undo/redo history of committed documents. Pointer previews do not create hundreds of history entries; one gesture produces one undo step. Persist authored shared context through plugin storage with revision checks; local viewports and legacy geometry remain recoverable independently. Version new state rather than overwriting v3 layouts. Reject non-finite coordinates, excessive text/counts, duplicate IDs, dangling authored links and unsafe URL schemes.

## Interface
Use the approved square-grid/floating-toolbar design, original Agent Canvas identity and BB theme tokens. Workspace/floor sidebar replaces project tabs, with library drawers for roles, ensembles, collections and settings. Keyboard-operable node headers/actions, a connection tool, marquee selection, context actions and arrangement controls make canvas operations available beyond gestures. Double-click lifts into a centered panel; explicit dock-left/right actions and edge dragging attach it to the viewport. Native ThreadChat is preserved inside agent panels. Phone layouts present accessible stacked nodes and compact workspace selection.

## Live resources and orchestration
RPC validates all payloads. Resource actions resolve the selected environment from BB before any filesystem or process action. File paths are relative to that root and must pass realpath containment including symlinks. Browser actions use Steel's existing project binding, never another session's cookies. A capture-only node keeps that label until actual project-bound interaction is available.

Role assignment stores instructions and presentation explicitly. Agent creation and prompt sends are explicit user actions through BB SDK; imports create templates without execution. Maestro tools verify the invoking thread's assigned permission and actual graph connections on every request, and bound returned context. Dismiss means stop/archive a recruit, not delete conversation history. Floor creation uses BB's environment API; landing and PR preparation expose reviewable changes and do not automatically merge or publish.

## Delivery sequence
1. Import and verify the baseline and package independently.
2. Add the validated document operations, history and import model.
3. Build the approved UI with authored nodes, arrangement, groups, connections, navigation and persistence.
4. Add roles, composition, scoped note tools and explicit recruitment.
5. Add environment-bound resources, floor integration, libraries and routines.
6. Exercise the installed plugin and every acceptance criterion; perform fresh-context review and integrate only verified changes.

This sequence does not reduce final scope. parity.md remains authoritative for outstanding features. No incomplete portable criterion is marked complete on the strength of a mockup or baseline tests.

## Failure and accessibility states
Retain local draft documents after failed saves and offer retry/conflict resolution. Show native resource unavailable, disconnected snapshot and provider error separately. Empty workspaces show insertion actions. Use text labels beside role/status colors, theme-appropriate contrast, usable default typography, accessible button names and keyboard move/resize actions. Drawers close with Escape and return focus to their trigger. Narrow layouts must make all nodes reachable.

## Validation
Pure model tests exercise locked group movement, connection-preserving duplication, import bounds, history branching, snapping, alignment/distribution and group dissolution. Server tests prove cross-thread access denial and file root containment. Real Steel browser scenarios exercise the actual mounted React UI and persistence. Root install/check plus pinned plugin build/types validate dependency compatibility. Collect exact phase receipts before claiming implementation, verification or integration.
