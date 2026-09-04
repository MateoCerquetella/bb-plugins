# Clean My Context

Clean My Context gives every existing BB thread a small composer action that
resets that thread in place. Its previous chat and provider context leave the
active timeline, while the exact thread, project, branch, folder, workspace,
execution settings, and composer remain available for the next prompt.

The operation uses the context-clear API introduced by
[get-bb/bb#2500](https://github.com/get-bb/bb/pull/2500).

The action is deliberately limited by BB's core safety rules: the thread must
be idle or failed, writable, and free of pending user interactions. BB stops
the released provider session, records one visible `Context cleared` boundary,
hides older rows from the active timeline, and retains their durable events
without changing workspace state.

## Install

Install the Git release from this multi-plugin repository:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 \
  --subdirectory plugins/clean-my-context \
  --tag-prefix clean-my-context/
```

The plugin requires BB 0.41 or newer and either the context-clear preview SDK
0.4.41 or the upstream SDK 0.4.46 and newer. Intermediate SDK releases do not
provide the explicit same-thread CLI operation and are intentionally rejected.

## Use

Open an idle or failed thread and select **Clear this thread** beside the
microphone in the expanded composer. Confirm the action; BB stays on that exact
thread and resets its active chat and provider context.

The same in-place reset is available from the CLI:

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
