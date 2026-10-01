---
name: steel-browser
description: Use the self-hosted Steel Browser service on dyaus for browser sessions, screenshots, scraping, or CDP automation instead of KERNEL.SH.
---

# Steel Browser

## Show the live browser in the current thread

When the user asks to see the Steel browser in BB, emit this complete message
directive on its own line:

```text
::steel-browser{}
```

The directive opens the Steel player in the current thread's right panel. Do
not send the user to the BB Connect URL unless they explicitly request a
separate browser window.

Use the local Steel service instead of KERNEL.SH when browser infrastructure is
needed in this BB environment.

## Endpoint

- API and UI: `http://127.0.0.1:3100`
- API documentation: `http://127.0.0.1:3100/documentation/`
- Debugger transport: `127.0.0.1:9223`

## Session workflow

1. Check `bb steel-browser status`.
2. Reuse an appropriate active session from `bb steel-browser sessions`, or
   create one with `bb steel-browser create`.
3. Read the returned `websocketUrl` to connect Playwright or Puppeteer over CDP.
4. Release the exact session with `bb steel-browser release <session-id>` when
   the work is complete.

The commands print JSON. Never expose the loopback endpoint publicly, invent an
API key, or release a session you did not create or explicitly select.
