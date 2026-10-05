# Steel Browser

The installed plugin contributes browser instructions to every new BB agent
session through `bb.agents.contributeInstructions`. Agents must check
`bb steel-browser project` before claiming browser access is unavailable,
including when no dedicated browser tool appears in their tool list.
Existing live sessions retain their original instructions until BB constructs
a new provider session. This is agent guidance, not an OS-level browser lock.

`bb steel-browser project`, `bb steel-browser run`, and the selected project's
operational dashboard/session actions automatically provision and bind a missing
project browser on the plugin server host. The all-projects overview remains
read-only. Setup reuses a matching container after interrupted setup, waits for
Chromium, and verifies its project label, profile volume, and loopback ports
before saving the binding.
Setup is serialized within the plugin; Docker reserves the container name and
ports across processes. A conflicting container fails without replacement.
Docker and an enrolled BB Connect host matching the server's hostname are required.

Existing bindings also pass through readiness checks: API health alone is not
enough; Chromium CDP must respond. Both local probes run concurrently with a
900ms timeout. A healthy result is reused for ten seconds; subsequent actions
recheck for a stopped browser. Healthy saved bindings skip Docker and BB Connect setup and do
not wait for another project's provisioning; concurrent requests for the same
project share the readiness check. Only failed readiness enters validated repair.
A validated project container that remains
unready gets one recovery attempt. Recovery stops the old container before
clearing only Chromium's three singleton lock artifacts from its named profile,
then starts a replacement with the same endpoints and profile volume.
Conflicting saved bindings and profiles used by other running containers fail
closed. Recovery never replays a browser navigation or paid agent task.

Steel automatically maintains an idle bootstrap session, including after a
release. `create` and **New session** may start a new session from that idle
state. A live session still requires explicit release before replacement.

Frontend project/dashboard reads retry once after 15 seconds without a response.
If both attempts stall, the page reports the failed request and enables Refresh
instead of staying at Connecting indefinitely. Session mutations time out after
30 seconds without automatic replay; work may still finish on the server, so
refresh before trying again. Late responses do not replace the recovered state.

Browser navigation stays in the current BB thread with no external viewer
links. Website logins happen inside the remote browser. BB Connect
authentication is separate: GitHub OAuth may refuse iframe embedding.
If that blocks the viewer, report the authentication limitation rather than
opening an external browser. Session health does not prove viewer access.

The Browser viewport has a **Watch browser** play control and embeds Steel's
session player, not the Steel dashboard. **Sign in / Take control** opens a modal
with the live player inside the thread. After signing in, select **Done** to
reload the main viewer. Disconnecting the viewer leaves
the browser running; releasing a session closes it. Idle sessions remain usable.
The play control connects the viewer; it does not start a jev-ultrafast agent.

Steel Browser gives BB a compact operational surface for a self-hosted
[Steel](https://github.com/steel-dev/steel-browser) instance. It shows service
health and active sessions, creates browser sessions, and releases them with an
explicit confirmation.

In a BB thread, agents render the live browser inside chat by
emitting `::steel-browser{}`. The inline viewer and local CDP automation target
the same Steel session, so agent actions remain visible without opening the
right panel or navigating away from the thread. When its message scrolls away,
the latest viewer follows the thread viewport in a compact position, capped to
55% of the available height so the composer remains accessible. Dashboard state
refreshes every fifteen seconds while BB is visible without reloading the iframe.
The inline viewer can be
minimized to its compact header and restored without stopping the session or
reloading the browser. A manual **Steel Browser**
thread-panel action remains available from the panel launcher.

### Agent Configuration

BB Tools / Steel Browser exposes the jev-ultrafast checkout path, host-only
credentials file path, and text-model identifier. The inline viewer's settings
icon shows those saved values. The adapter connects Jev's upstream observation
and action loop to the project's existing page through a temporary authenticated
loopback CDP bridge; it does not attach Browser Harness to a personal Chrome.
Supported upstream revision: `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`.
Install that checkout on the Steel host and run `uv sync --frozen`.
Live model execution has not been verified.

Never put API keys in these fields or in chat. Jev requires `TYPESAFE_API_KEY`
and `TEXT_MODEL_API_KEY` in the host-side environment. Its live runs make
potentially billable external API calls. Direct Playwright/CDP navigation demos
are not Jev runs.

The credentials file must have mode `0600`. It is read only during explicitly
authorized Jev preflight; values are not returned through the plugin API.

## Project Profiles

Thread operations resolve BB's project identity server-side. Every project
requires its own Steel container and named Chromium volume. Missing bindings
are created on demand by the CLI, and existing bindings cannot be silently overwritten or reused by
another project. Legacy global endpoint settings remain for compatibility but
are no longer used by the viewer or CLI. Existing global cookies are not copied.

From a thread belonging to the intended project, run `bb steel-browser project`
for automatic setup. The following manual commands are for recovery only:

```sh
bb steel-browser project
bb connect expose <unused-api-port>
node plugins/steel-browser/scripts/provision-project.mjs <project-id> <unused-api-port> <unused-cdp-port> <returned-https-origin>
bb steel-browser bind <loopback-api-url> <loopback-cdp-url> <returned-https-origin>
```

Use exact values returned by these commands. Binding verifies the running
container's project label, profile volume, ports and viewer domain. Provisioning
is triggered by CLI browser work, not by opening an overview or thread. Ports stay on loopback and the
viewer uses authenticated BB Connect. Cookie/profile volumes are sensitive host
data: never commit or export them through chat. Volume deletion loses logins.
Persistent cookies survive restart after Chromium flushes them to its profile.
Abrupt shutdown can lose recent writes; browser-session cookies also follow the
website's own expiry rules. A profile is not a guarantee that every site keeps
you signed in forever.

The CDP address is loopback on the Steel host, not necessarily on the agent's
machine. For a remote BB thread, use the routed CLI for browser actions:

```sh
bb steel-browser run https://example.com
bb steel-browser inspect
bb steel-browser click link "More information..."
bb steel-browser fill textbox "Search" "query"
bb steel-browser press Enter
bb steel-browser screenshot | jq -r .base64 | base64 --decode > /tmp/steel-page.png
```

`inspect` returns the current URL, title, and a bounded accessibility snapshot.
Click and fill require one exact accessible name; ambiguous targets fail without
acting. A screenshot returns base64 PNG in JSON for local inspection. These
actions run against the existing project page on the Steel host, do not make
paid model calls, and do not copy the browser profile or expose its CDP port.
Website credentials and MFA should still be entered by the user in the inline
viewer, never via agent command arguments.

## Engines

BB Tools / Steel Browser has project-scoped engine selection and a separate
fallback checkbox. Playwright is the default; fallback defaults off. Auto tries
Jev first. Selecting Jev or Auto does not authorize paid API calls.

```sh
bb steel-browser engine auto fallback-on
bb steel-browser run https://example.com
bb steel-browser run https://example.com "Read the page heading" --allow-paid
```

URL-only Playwright runs navigate directly. Natural-language Playwright tasks
return `agent-handoff` with the project's CDP endpoint so the BB agent can carry
out the task; they are not falsely marked completed. Jev needs a goal, configured
runtime/keys and explicit `--allow-paid`. A fallback is chosen only if preflight
fails, never after browser execution begins. A Jev `done` result is the model's
claim and still needs outcome verification. Failures and cancellation after
dispatch require inspection before retrying. Do not run multiple controllers
against the same project's page.

## Install

Steel, Docker and the optional Jev runtime must be reachable from the BB server
on dyaus. This implementation does not dispatch runners to a different host.

```sh
bb plugin install ./plugins/steel-browser
bb plugin reload steel-browser
```

Open **Steel Browser** in BB or use:

```sh
bb steel-browser status
bb steel-browser sessions
bb steel-browser create
bb steel-browser release <session-id>
```

Each project instance supports one active session. Create refuses to replace
a live session; release checks its identifier first. Separate projects may run
concurrently. One project shares one account profile across its threads.

## Host service

On dyaus, Steel is managed by `steel-browser.service` and Docker Compose under
`~/.local/share/steel-browser`. The API/UI and debugger are bound only to
loopback. Inspect or restart it with:

```sh
systemctl --user status steel-browser
systemctl --user restart steel-browser
docker logs --tail 100 steel-browser
```

## Development

Run from the workspace root:

```sh
npm install
npm run check --workspace bb-plugin-steel-browser
```

Steel is Apache-2.0 software maintained by Steel.dev. This plugin is not
affiliated with or endorsed by Steel.dev.
