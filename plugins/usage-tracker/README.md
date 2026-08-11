# Usage Tracker

Usage Tracker adds a compact live strip to bb's bottom sidebar footer. Codex
and Claude Code each show a mini progress bar plus their **5h** and **wk**
usage at a glance.

Select either provider to reveal its full five-hour and weekly rows, including
reset timing, without leaving the current thread. Use the refresh icon to fetch
both providers again.

## What it shows

- Five-hour and weekly percentages for Codex and Claude Code.
- A native-sized mini bar for fast scanning.
- Click-to-expand reset timing in the sidebar itself.
- Last-known values retained through partial or rate-limited refreshes.

The plugin uses bb's trusted `contentScripts` lifecycle and
`system.usageLimits` data surface. It mounts only inside the host-owned sidebar
footer, removes everything on reload/disable, and runs alongside t3sidebar.

## Install

```sh
bb plugin install npm:bb-plugin-usage-tracker
```

Update or remove it with `bb plugin update usage-tracker` or
`bb plugin remove usage-tracker`.

## Develop

From the repository root, run `npm install` and `npm run check`. For live
development, run `npm run dev --workspace bb-plugin-usage-tracker`.
