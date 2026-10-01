# Steel Browser

The Browser viewport has a **Watch browser** play control and embeds Steel's
session player, not the Steel dashboard. **Sign in / Take control** opens a modal
with the live player and a new-tab fallback if BB Connect requires authentication.
After signing in, select **Done** to reload the main viewer. Disconnecting the viewer leaves
the browser running; releasing a session closes it. Idle sessions remain usable.
The play control connects the viewer; it does not start a jev-ultrafast agent.

Steel Browser gives BB a compact operational surface for a self-hosted
[Steel](https://github.com/steel-dev/steel-browser) instance. It shows service
health and active sessions, creates browser sessions, and releases them with an
explicit confirmation.

In a BB thread, agents render the live browser as a square inside chat by
emitting `::steel-browser{}`. The inline viewer and local CDP automation target
the same Steel session, so agent actions remain visible without opening the
right panel or navigating away from the thread. A manual **Steel Browser**
thread-panel action remains available from the panel launcher.

## Install

Steel must be reachable from the BB server. This host uses the loopback-only
instance at `http://127.0.0.1:3100`.

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

The endpoint can be changed in **Settings → Steel Browser**. It must be an
HTTP(S) URL without embedded credentials, query parameters, or fragments.
For remote BB access, set **Browser-accessible Steel URL** to the authenticated
BB Connect share. The API endpoint stays local to the server.
Steel must also advertise the share hostname via Compose `DOMAIN` (without a
scheme) and `USE_SSL: "true"` so its player uses the remote `wss://` endpoint.
On dyaus this is `cerq--3100.getbb.app`. Changing these settings recreates the
container and closes existing tabs. Local agents can still attach explicitly to
`ws://127.0.0.1:3100/`; do not use the advertised remote URL for local automation.

This deployment supports one active session per Steel instance. Create refuses
to replace a live session; release checks its identifier first. Direct API
clients must not race these operations. Multiple concurrent account profiles
are not implemented, and the current volumes do not preserve logged-in Chrome
profiles across container replacement.

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
