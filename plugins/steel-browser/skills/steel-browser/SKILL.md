---
name: steel-browser
description: Use for every browser task in BB, including AWS Console, website sign-in, app navigation, screenshots, scraping, and CDP automation. Check bb steel-browser project before claiming browser access is unavailable. Use Steel instead of KERNEL.SH or an external browser.
---

# Steel Browser

## Availability In New Threads

Steel is accessible through the terminal CLI even when no browser-specific
tool appears in the agent's tool list. Before claiming it is unavailable, run
`bb steel-browser project` in the current thread and inspect the result.
Use the returned project binding, never a remembered endpoint from another
thread. The command automatically provisions and binds a missing project
browser on the Steel server host. Wait for setup, then continue the requested
navigation; do not stop at "no binding" or substitute another browser.
If Docker, BB Connect, or startup fails, report the actual command error.

## Show the live browser in the current thread

When the user asks to see the Steel browser in BB, emit this complete message
directive on its own line:

```text
::steel-browser{}
```

The directive renders the live Steel player directly inside the assistant
message. The latest viewer follows the thread viewport when its message scrolls
away; minimize it with the header control to stop its viewer stream without
stopping the browser session. Restore reconnects the viewer.
It does not open the right panel. Never send the user to a
BB Connect URL, Safari, Chrome, or another external browser window.

Always use this native directive, not an `inline-vis` HTML wrapper: the wrapper
adds an opaque sandbox around BB Connect authentication. If BB Connect
authentication blocks the viewer, stop and report the limitation. GitHub OAuth
may refuse iframe embedding; do not open an external browser or bypass
authentication. Session health does not prove the viewer is authenticated.

Use the local Steel service instead of KERNEL.SH, Safari, Chrome, or any
external browser when browser infrastructure is needed in this BB environment.
The current thread is the only browser surface: emit `::steel-browser{}`
whenever browser visibility is requested. Navigation between websites and apps
must happen as normal navigation inside that Steel session so the user can see
each step in the thread.

## Project And Engine

First run `bb steel-browser project` in the current thread. It resolves the
project from BB, returning its dedicated API/CDP/viewer endpoints and engine
policy. Never use the old global ports 3100/9223 as a fallback. A missing
binding is automatically provisioned by this command with dedicated ports and
a persistent project profile. Repeated calls validate readiness and reuse the
same binding; an unready validated container gets one bounded recovery attempt.
Never copy cookies from another project's profile.

## Human Login And Saved Accounts

The inline and plugin-page viewers have Copy, Paste and Take control buttons.
Ask the user to focus the website field, then use Paste (including native paste
into its masked local field). Never ask for passwords, MFA or clipboard values
in chat or pass them as CLI arguments. The clipboard bridge stays between the
user's frontend and the project viewer; it does not use an agent tool.

The plugin page has Sign in actions for GitHub, Linear and Google and
project-scoped saved account labels. These are explicitly user-confirmed, not
proof of a currently valid website session. Do not tell an agent that an account
is authenticated solely because a label exists. Forgetting a label does not log
out the website. BB API connector connections are separate from browser logins.

The inline engine select and fallback checkbox persist per project. CLI:
`bb steel-browser engine <playwright|jev|auto> <fallback-on|fallback-off>`.
For tasks, use `bb steel-browser run <url> [goal] [--allow-paid]`. Never pass
`--allow-paid` without explicit user authorization for external model calls.
Auto prefers Jev; fallback applies only to preflight failures before execution.

URL-only Playwright runs navigate directly. For natural-language tasks,
`agent-handoff` means this BB agent must perform the task via Playwright using
the returned project's CDP endpoint, then verify the result. It does NOT mean
the goal was completed. Jev's `done` likewise requires independent verification.
Do not replay actions after an uncertain execution error, cancellation or timeout.

## Session workflow

1. Check `bb steel-browser status`.
2. Reuse an appropriate active session from `bb steel-browser sessions`, or
   create one with `bb steel-browser create`.
   Steel's idle bootstrap session does not block creation. A live session must
   be explicitly selected for release before replacing it.
3. Use `binding.cdpUrl` from `project` for local CDP. Fetch `/json/version`;
   retain its WebSocket path but replace its host/port with that CDP binding
   because upstream may omit the mapped port. Do not use another project's URL.
   The CDP loopback belongs to the Steel host and may be unreachable from this
   thread's machine. If so, use routed `bb steel-browser inspect`,
   `click <role> <exact-name>`, `fill <role> <exact-name> <value>`,
   `press <key>`, and `screenshot`. These default to the newest open tab.
   Use `bb steel-browser tabs` to list open tabs and append `--tab <index>`
   to a routed action to target an earlier tab. `screenshot` returns JSON with
   a base64 PNG; redirect and decode it locally for inspection. Do not put
   credentials or MFA in CLI arguments.
4. Release the exact session with `bb steel-browser release <session-id>` when
   the work is complete.

The commands print JSON. Never expose the loopback endpoint publicly, invent an
API key, or release a session you did not create or explicitly select.
