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

## Cache diagnosis and conservative switching

`task-cache-v2` records cold starts, idle gaps, changed requests and warm-prefix opportunities separately; an observed zero hit is labeled accordingly rather than automatically blamed on routing. Real provider diagnoses, when present, are allowlisted separately. Probe compatibility before populating `~/.codex/codex-router/jev-cache-diagnostics.json`; the default enables no comparison fields. Current native probes returned `unavailable` for Astra, Sol and Luna, so comparison requests remain disabled. If a previously verified optional field is explicitly rejected, the runtime disables it and retries without that field only before any response bytes were relayed.

A new-task recommendation can retain an equally-or-more-capable warm model/effort only when recent measured input caching predicts at least 20% lower input-credit proxy cost than the cold candidate. It declines after five minutes, material prompt growth, changed prefixes/configuration, or failures, and never blocks required model/effort upgrades. Published Standard rates are pinned to 2026-09-25; this is an input-only estimate, not a guarantee about output, task cost, or subscription quota.

To correlate content-free fingerprints before/after the native adapter, install the trace helper and restart the shared router when idle:

```sh
node plugins/jev-route/ops/install-cache-trace.mjs ~/.local/share/codex-router
```

Only internally correlated Jev calls emit native fingerprints. The correlation header is not forwarded upstream. Trace files rotate at 10 MiB with one retained predecessor; write failures never fail inference. No request text, tool definitions, ciphertext or response IDs are recorded in the trace. Python and JavaScript fingerprints normalize property order and numeric representations.

## Controlled read-only comparison

`ops/native-benchmark.py` explicitly requires `--confirm-quota-use`. It compares three self-contained code/state-analysis tasks across fixed Astra Low, fixed Astra Medium and Jev, with three sequential answer checks per task/arm. Arms use identical starting code, instructions and tools, counterbalanced ordering and isolated session keys. The only tool records an answer; it executes no code or external action. Correct answers are checked objectively. No automatic retries are made. This is a small controlled check, not a benchmark of full project completion quality.

```sh
python3 plugins/jev-route/ops/native-benchmark.py --benchmark --confirm-quota-use --output /tmp/jev-benchmark.json
```

The harness limits requests to 36, gates subsequent calls at 250K input/15K output tokens, and bounds per-call elapsed time and response size. Usage is known after completion, so a single in-flight request may exceed a token stop threshold; the report preserves measured consumption and errors. `--seed-budget` accepts a JSON file with reserved `calls`, `input`, and `output` to share a budget with prior probes. `--probe` checks optional provider diagnostics using an actual baseline response; unsupported or unavailable comparisons are never represented as cache-hit proof. Keep reports local unless reviewed for publication.

**Native budget limitation:** the native endpoint does not enforce a hard per-call output-token ceiling. The runner now refuses network calls by default even with `--confirm-quota-use`. Only after explicitly accepting that an in-flight request may exceed token stop thresholds, add `--allow-token-stop-thresholds`. The default is now two checks per task/arm (18 executor calls); classifier calls/tokens are counted too. Unknown usage stops the run. Request count, 128 KiB request size, 2 MiB response size, and a 90-second cancellation timer remain bounded, while token limits gate subsequent calls. Completed rows and pending attempts are atomically checkpointed so a stopped run retains its evidence.
