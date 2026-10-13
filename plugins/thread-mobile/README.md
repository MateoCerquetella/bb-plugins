# Thread Mobile

One-thumb thread navigation for BB mobile. Requires BB 0.40.0 or newer.

On screens up to 767px wide, Thread Mobile places previous/next arrows and a
swipeable title above the thread composer. Swipe left for the next thread or
right for the previous one. Keyboard arrows work when the title is focused.

Navigation stays in the current project, newest-created first, without wrapping.
Archived and hidden threads are excluded. Child threads are skipped except for
the currently open child. Live sidebar updates keep the list current.

The secondary line shows the current thread's live BB status alongside its
position. Status uses BB's own indicator label (including working or needing
input); no indicator is shown as "Idle", not as a claim that work is complete.
Unknown states without a host label display "Status unavailable".
The status line includes a small Dockside-style state icon, and the navigation
controls use matching chevron icons with accessible labels.

Swipes only start on the title strip. Vertical scrolling, short gestures,
cancelled pointers and secondary touches do not navigate. The plugin never
archives, deletes or modifies messages, and uses BB navigation to preserve
host-managed drafts. The strip is hidden on desktop.

## Install

From the workspace root:

```sh
bb plugin install ./plugins/thread-mobile
bb plugin reload thread-mobile
```

## CLI

```sh
bb thread-mobile list <project-id>
```

Returns visible non-archived project roots as JSON in navigation order.

## Development

```sh
npm install
npm run check --workspace bb-plugin-thread-mobile
```

BB 0.40.0 ships SDK 0.4.21. Build scripts clear `BB_CLI` to use the pinned
workspace toolchain. No vendored SDK declarations or host patches are required.
