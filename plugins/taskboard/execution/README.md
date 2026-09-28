# Execute approved Taskboard work with Symphony

Taskboard keeps the task, approved scope, verification, and tracker status.
Symphony runs the coding agent in an isolated workspace. **Start agent** opens
the dedicated Worker page when managed execution is enabled and falls back to
the existing composer handoff when it is disabled.

## Setup

This integration targets OpenAI Symphony commit `be10a1b79df723d6d7612b5651c8522704dafb2e`. Upstream's HTTP API exposes status and refresh, not job submission. The included extension adds a Taskboard tracker using Symphony's existing tracker behaviour; the installer makes two explicit registration edits in a dedicated Symphony checkout.

```sh
git clone https://github.com/openai/symphony.git /path/to/taskboard-symphony
git -C /path/to/taskboard-symphony checkout be10a1b79df723d6d7612b5651c8522704dafb2e
node plugins/taskboard/execution/engines/symphony/runtime/install.mjs /path/to/taskboard-symphony
cd /path/to/taskboard-symphony/elixir
mix local.hex --force
mix local.rebar --force
mix deps.get
mix compile
```

Copy `engines/symphony/runtime/WORKFLOW.example.md` to a runtime-owned `WORKFLOW.md`. Configure these environment variables for **the Symphony process**, using a private environment file or your service manager:

| Variable                     | Value                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `TASKBOARD_URL`              | BB server URL followed by `/api/v1/plugins/taskboard/http/execution/v1`            |
| `TASKBOARD_TOKEN`            | Taskboard's plugin HTTP token, obtained locally with `bb plugin token taskboard`   |
| `TASKBOARD_RUNTIME_ID`       | `taskboard`, or the configured runtime identity                                    |
| `TASKBOARD_WORKSPACE_ROOT`   | Absolute directory shared with the BB server, e.g. `/path/to/taskboard-workspaces` |
| `TASKBOARD_WORKSPACE_HELPER` | Absolute path to `engines/symphony/runtime/workspace.mjs` in this plugin           |

Create the workspace root before starting. Keep the token out of source control and prompts. The adapter strips it from the coding agent's environment. Do not configure Linear, GitHub, or Jira credentials in this runtime. Run one Symphony daemon per Taskboard runtime identity. Use a private connection with TLS if BB is not on loopback; do not expose the plugin token in a URL.

Start Symphony using its normal CLI and the example workflow, with its HTTP observation server enabled. Review the upstream runtime's sandbox and permission configuration before running real work. The provided example uses a workspace-write sandbox. Set `agent.max_concurrent_agents` to match Taskboard's concurrency setting; the adapter rejects a mismatch.

Configure the existing Taskboard plugin through BB plugin settings or its CLI:

```sh
bb plugin config taskboard set symphonyWorkspaceRoot /path/to/taskboard-workspaces
bb plugin config taskboard set symphonyEndpoint http://127.0.0.1:4000
bb plugin config taskboard set symphonyRuntimeId taskboard
bb plugin config taskboard set symphonyMaxConcurrency 4
bb plugin config taskboard set symphonyMaxRetries 3
bb plugin config taskboard set symphonyRunTimeoutMs 3600000
bb plugin config taskboard set executionMaxFixIterations 2
bb plugin config taskboard set executionDefaultEngine symphony
bb plugin config taskboard set executionEnabled true
```

`executionDefaultEngine` defaults to `local`; `executionEnabled` defaults to `false`. The endpoint and workspace root also accept `TASKBOARD_SYMPHONY_ENDPOINT` and `TASKBOARD_SYMPHONY_WORKSPACE_ROOT` in the **BB server's** environment. Settings and environment values contain no hardcoded credentials.

## Use

1. Open a task and select **Start agent**, use the play action on a Kanban card,
   or move a card into an in-progress column.
2. Taskboard opens the Worker page and derives a bounded delegated scope from
   the task. A valid repository without commits receives an empty initial
   commit; existing staged and untracked files are not included.
3. A stable dispatch key prevents duplicate starts, including a repeated click
   after a lost response.
4. Inspect execution status on the Worker page. Advanced details include
   engine, execution/run IDs, workspace, agent, retries/errors, and Git metadata.
5. Once the agent calls `taskboard_handoff` and Symphony releases the workspace, Taskboard automatically checks the actual repository/branch/commit and runs the approved commands. **Verify implementation** also allows an explicit rerun.
6. Review acceptance criteria against the changes and confirm them after checks pass. Then use Taskboard's existing status menu to advance the provider's workflow. Symphony never makes that transition.

Failed checks automatically create linked fix executions with the same approved scope and failure feedback, up to `executionMaxFixIterations` (default two; zero disables automatic fixes). After that budget, the task stays incomplete for review and can be explicitly retried. The new isolated workspace starts from the previous implementation commit. A canceled or failed execution can be explicitly resumed after the runtime stops; resume preserves identity and increments its generation so late events cannot complete a newer attempt.

## Boundaries and limitations

- The initial verifier requires the runtime workspace on the BB server host, or mounted at the same absolute path. Arbitrary remote workspaces without shared access are unsupported. Taskboard fails verification rather than trusting an agent's test report.
- Taskboard did not previously have a planner, router, approval system, or verifier. This adds explicit reviewed work units, independent command verification, and human acceptance review. It does not generate plans/specifications automatically or infer completion semantically from agent output.
- Local execution remains the existing composer handoff. It has no fabricated run status. Selecting direct/local in the execution dialog also returns to the composer.
- The coding agent must commit its work before handoff. Taskboard rejects dirty workspaces, branch changes, a changed implementation revision, or mismatched repositories. It does not merge, deploy, or automatically push code.
- Upstream observation data is ephemeral. A missing runtime entry is never treated as implementation success. Execution intent, immutable scope, generation, events, and evidence persist in Taskboard's plugin database across reload/restart.
- Retry and timeout budgets are enforced by the Symphony extension. Taskboard records the resulting runtime events. Workspace/checkout failures and agent crashes use Symphony's existing retry mechanism.
- Required commands run as argv with bounded time and output, not through shell expansion. They run with a minimal environment. Set up project dependencies in the workspace using your approved plan; do not rely on inherited runtime credentials.
- API callers may declare repository-relative `inputs` for a check. Passed evidence is reusable only when the request digest, check definition, and Git content for those paths match. Checks without declared inputs invalidate on any tree change. Choose inputs conservatively, including build configuration and dependency lockfiles.
- This is a pinned downstream Symphony extension. Upgrading Symphony requires reviewing the registry integration and rerunning compatibility tests; the installer refuses other revisions.

## Implementation map

`contract.ts`, `request.ts`, and `engine.ts` define stable execution data and boundaries. `store.ts` persists runs/events. `manager.ts` handles durable intent and reconciliation. `engines/local` preserves handoff; `engines/symphony` contains all upstream protocol and runtime extension code. `verification.ts` owns command verification and evidence reuse. `server.ts` connects these to supported BB APIs; `panel.tsx` extends the existing detail UI.

Run Taskboard checks from the repository root with `npm run check --workspace bb-plugin-taskboard`. For upstream adapter tests, copy `runtime/taskboard_test.exs` into the pinned checkout's `elixir/test/symphony_elixir/`, install the extension, and run `mix test test/symphony_elixir/taskboard_test.exs` there. Runtime tests use synthetic data and do not run a paid coding agent.
