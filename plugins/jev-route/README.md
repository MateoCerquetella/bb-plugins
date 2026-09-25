# Jev Routing

Shows the actual routed model and reasoning beside BB’s model picker only while Jev Routing is selected, with paginated Jev history. Click the badge to open history; Close or Escape dismisses it. No history messages are injected into the conversation.

Plugin settings include 18 color presets, a custom color picker, and saved overrides for any model ID. Tracking reads BB thread events and is scoped to Jev routing. Actual per-call Jev selections are read from the local routing log when the selected model is `jev/auto`.

## Install

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git --plugin jev-route
```

The plugin runs on BB 0.40 or later. Manual model selections do not display routing badges. Automatic routing currently uses the Codex Responses transport; installing this plugin alone does not configure another provider's routing.

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

Jev selects Luna, Sol or Astra and a reasoning depth for each task, retaining both during successful append-only tool continuations. Requests retain their conversation payload. Caches are model-specific. A Jev API failure falls back to Astra/medium and is recorded in the routing log; a missing or unavailable router is an execution error. The runtime keeps the upstream routing policy and model IDs.

## Verify

```sh
npm run check --workspace bb-plugin-jev-route
python3 -m unittest discover -s plugins/jev-route/runtime -p 'test_*.py'
```

The Python runtime is adapted from [0xNatoshi/jev-codex-router](https://github.com/0xNatoshi/jev-codex-router), revision `6905869590038489ce0ad6d6e4b236e64d050ed3`, copyright Thibault Saint-Jean, under the MIT license in `runtime/LICENSE`. This copy adds an explicit HTTP user-agent for TypeSafe compatibility.

Codex routing uses only native Luna, Sol and Astra models. Legacy dry flags do not select external providers. Quota failures are returned to Codex without DeepSeek/GLM retries.

## Cache-aware task routing

Repeated tool continuations reuse the selected model and effort, avoiding classifier calls and unnecessary pair changes. New user requests, changed instructions/tools/settings, rewritten or compacted history, 30 minutes idle, two successive detected tool errors or provider failures trigger re-evaluation. Failure escalation within an unchanged task never reduces the prior model/effort; the model moves up at least one tier when possible. Decisions use a bounded, thread-safe, process-local cache of 512 session hashes. Restarting safely reclassifies; requests without a cache key never share state. Off and shadow controls bypass retained decisions.

`cache_observation` in the routing log includes the selection reason, reuse flag, model/effort change flags, changed configuration fields, hashes and actual cache reuse percentage when available. These are local observations, not provider-confirmed cache-miss diagnoses. The router preserves the caller’s cache controls and full conversation; it does not cache answers, rewrite prompts, inject unverified API options or promise a cache-hit target. Tool failure detection remains heuristic.

## Native reasoning replay compatibility

Some Codex Router builds run generic reasoning-to-assistant-text conversion even for the Jev Responses route. That replaces a native reasoning item (including its encrypted continuation token) before the request returns to native Codex. Preserve the original native history instead:

```sh
node plugins/jev-route/ops/native-replay-compat.mjs ~/.local/share/codex-router
```

The repair preserves only native-only reasoning histories (opaque continuation tokens, native item IDs, no foreign plaintext thinking); legacy foreign/mixed histories keep the existing adapter behavior.

The helper validates the installation identity, backs up `src/router.mjs`, and changes only the `jev` provider with the Responses adapter. Other providers, Chat Completions behavior, credentials and service configuration are untouched. It is idempotent and refuses an unrecognized source shape. Restart the shared Codex Router only after active requests finish. Recheck compatibility after upstream router upgrades; do not blindly patch changed source. This restores native continuation semantics but does not guarantee a cache-hit percentage.

Read-only verification against the installed adapter: `node plugins/jev-route/ops/verify-native-replay.mjs ~/.local/share/codex-router`. It uses isolated synthetic fixtures, makes no provider calls, and checks that native continuations are preserved while foreign histories and other providers retain their prior behavior.
