# Jev Routing

Shows the latest requested model and reasoning level beside BB's model picker, with per-thread, paginated model history. Click the badge to open history; Close or Escape dismisses it. No history messages are injected into the conversation.

Plugin settings include 18 color presets, a custom color picker, and saved overrides for any model ID. Tracking reads BB thread events and is provider-independent. Actual per-call Jev selections are read from the local routing log when the selected model is `jev/auto`.

## Install

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git --plugin jev-route
```

The plugin runs on BB 0.40 or later. Normal model tracking does not require Jev. Automatic routing currently uses the Codex Responses transport; installing this plugin alone does not configure another provider's routing.

## Independent Linux Routing

On the execution machine, install [Codex Router](https://github.com/duolahypercho/codex-router) and sign in to Codex. A TypeSafe API key is required in the private `~/.jev.env` file as `TYPESAFE_API_KEY=...` (mode 600). Never commit that file.

Copy this plugin's `runtime/` to `~/.local/share/jev-codex-router/server/`. Install `ops/jev-router.service` in `~/.config/systemd/user/`, then:

```sh
systemctl --user daemon-reload
systemctl --user enable --now jev-router
~/.local/share/codex-router/bin/codex-router chatgpt-session enable
~/.local/share/codex-router/bin/codex-router providers generic add jev --name 'Jev Routing' --base-url http://127.0.0.1:4319/v1 --adapter openai-responses --allow-private
node ops/register-model.mjs
~/.local/share/codex-router/bin/codex-router refresh-catalog
~/.local/share/codex-router/bin/control picker set jev/auto show
systemctl --user restart codex-router
```

When BB runs on that same machine, `node ops/register-bb-model.mjs` and `bb settings reload` also register the picker entry in BB's managed configuration. Both registration scripts preserve existing entries. Other execution machines need their own routing installation before selecting Jev there.

Jev independently selects Luna, Sol or Astra and a reasoning depth for each call. Requests retain their conversation payload. Caches are model-specific. A Jev API failure falls back to Astra/medium and is recorded in the routing log; a missing or unavailable router is an execution error. The runtime keeps the upstream routing policy and model IDs.

## Verify

```sh
npm run check --workspace bb-plugin-jev-route
python3 -m unittest discover -s plugins/jev-route/runtime -p 'test_*.py'
```

The Python runtime is adapted from [0xNatoshi/jev-codex-router](https://github.com/0xNatoshi/jev-codex-router), revision `6905869590038489ce0ad6d6e4b236e64d050ed3`, copyright Thibault Saint-Jean, under the MIT license in `runtime/LICENSE`. This copy adds an explicit HTTP user-agent for TypeSafe compatibility.
