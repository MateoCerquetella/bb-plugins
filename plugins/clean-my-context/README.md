# Clean My Context

Clean My Context gives every BB thread a small header action that starts a
fresh model context without deleting the thread timeline or changing its
workspace. It uses the context-clear API introduced by
[get-bb/bb#2500](https://github.com/get-bb/bb/pull/2500).

The action is deliberately limited by BB's core safety rules: the thread must
be idle or failed, writable, and free of pending user interactions. BB stops
the released provider session, records a visible context boundary, and keeps
all existing history available in the app.

## Install

Install the Git release from this multi-plugin repository:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 \
  --subdirectory plugins/clean-my-context \
  --tag-prefix clean-my-context/
```

The plugin requires BB 0.42 or newer and Plugin SDK 0.4.40 or newer.

## Use

Open an idle or failed thread and select **Clear model context** in its header.
Confirm the action; the next prompt starts with fresh provider context.

The same behavior is available from the CLI:

```sh
bb clean-my-context clear <thread-id>
bb clean-my-context clear <thread-id> --json
```

When invoked in a BB thread context, the explicit thread id may be omitted.

## Development

```sh
npm install
npm run check --workspace bb-plugin-clean-my-context
bb plugin install ./plugins/clean-my-context
bb plugin reload clean-my-context
```
