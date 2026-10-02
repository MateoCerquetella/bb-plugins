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
thread. A missing binding means provisioning is required, not that BB lacks
browser support. Do not silently provision or substitute another browser.

## Show the live browser in the current thread

When the user asks to see the Steel browser in BB, emit this complete message
directive on its own line:

```text
::steel-browser{}
```

The directive renders the live Steel player as a square directly inside the
assistant message. It does not open the right panel. Never send the user to a
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
binding requires provisioning using the README's project setup commands.
Never copy cookies from another project's profile.

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
3. Use `binding.cdpUrl` from `project` for local CDP. Fetch `/json/version`;
   retain its WebSocket path but replace its host/port with that CDP binding
   because upstream may omit the mapped port. Do not use another project's URL.
4. Release the exact session with `bb steel-browser release <session-id>` when
   the work is complete.

The commands print JSON. Never expose the loopback endpoint publicly, invent an
API key, or release a session you did not create or explicitly select.
