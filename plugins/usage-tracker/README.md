<p align="center">
  <img src="./assets/icon.svg" width="64" height="64" alt="Usage Tracker icon" />
</p>

<h1 align="center">Usage Tracker for BB</h1>

<p align="center">
  Codex, Claude Code, and optional Antigravity limits in BB's sidebar footer.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/BB-%E2%89%A5%200.38-7c3aed?style=flat-square" alt="BB 0.38 or newer" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

Usage Tracker adds one compact, live strip beside BB's existing sidebar
utility icons. Claude Code and Codex each show a progress bar and their current
usage reading, without adding a navigation item or a separate plugin page.

![Usage Tracker expanded in BB's sidebar](./assets/usage-tracker-sidebar.png)

## Features

- Shows Codex, Claude Code, and optionally Google Antigravity usage in BB's sidebar footer.
- Lets you show or hide Codex and Claude Code independently, with Antigravity
  opt-in; the strip
  compacts for one provider and disappears when both are disabled.
- Lets you choose whether the compact percentage and progress bar show the
  weekly or five-hour limit. Weekly is the default.
- Expands either provider to show its five-hour, weekly, and additional
  provider-defined percentages.
- Shows the available Codex usage resets in the expanded details.
- Includes reset timing and provider session status in the expanded view.
- Refreshes automatically every five minutes and whenever a stale BB window
  becomes active again.
- Provides a manual refresh button for both providers.
- Preserves last-known limit windows through temporary errors, expired
  sessions, and rate limits.
- Cleans up its UI on plugin reload, disable, or removal and works alongside a
  custom thread list such as t3sidebar.

The configurable Compact limit was contributed by
[Stephen Dolan (@stephendolan)](https://github.com/stephendolan).

## Install

Usage Tracker requires BB 0.38 or newer. Install its tracking Git release:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.3 --subdirectory plugins/usage-tracker --tag-prefix usage-tracker/
```

After [the BB Community entry](https://github.com/get-bb/marketplace/pull/129)
is updated and live, the equivalent shorthand is:

```sh
bb plugin install usage-tracker
```

The strip appears in the bottom of the sidebar as soon as the plugin loads.
Codex and Claude Code are enabled by default; Antigravity is opt-in. Change
these settings under **Settings → Plugins → Usage Tracker**. The same page lets
you choose between the weekly and five-hour limit for the compact reading.

The provider CLIs must be installed and signed in for BB to report their usage:

```sh
codex login
claude
agy
```

Antigravity quota probing runs in the background from a cached snapshot, so it
does not add its 3–4 second CLI startup time to the sidebar RPC response.

If a CLI is missing, signed out, or expired, expand that provider in the strip
to see the recovery instruction reported by BB.

## Use

The collapsed strip is designed for quick scanning:

- Select the Claude Code or Codex reading to open its details in place.
- Review the reported **5-hour limit**, **weekly limit**, every additional
  provider-defined window, and their reset times. Codex Pro accounts that do
  not report a five-hour limit omit that row.
- For Codex, select **Use a reset…** to open a confirmation. Nothing is
  consumed until **Yes, use reset** is selected; canceling the confirmation
  does not contact the reset-consumption endpoint.
- Select the same provider again, use the close button, press <kbd>Esc</kbd>,
  or click outside the details to collapse it.
- Select the refresh icon to fetch both providers immediately.

Usage Tracker otherwise refreshes in the background every five minutes. It
also refreshes when the window regains focus or becomes visible after the last
successful fetch has become stale.

## Update or remove

Check for updates and install the latest compatible release with BB:

```sh
bb plugin outdated
bb plugin update usage-tracker
```

Remove it with:

```sh
bb plugin remove usage-tracker
```

## Data and privacy

The plugin reads BB's local `system.usageLimits` data for provider windows. It
also uses the installed `codex app-server` with the existing local Codex
session to read the available reset count and, only after the explicit
confirmation above, request one reset. It does not ask for or store provider
credentials. Its only persistent browser data is the last successful usage
snapshot in local storage, used to keep useful values visible during a
temporary provider or network failure.

Usage Tracker runs as a trusted BB frontend content script. Install plugins
only from sources you trust.

## Develop

Clone the repository and run the workspace checks from its root:

```sh
git clone https://github.com/MateoCerquetella/bb-plugins.git
cd bb-plugins
npm install
npm run check
```

For a live Usage Tracker development loop:

```sh
bb plugin install ./plugins/usage-tracker
npm run dev --workspace bb-plugin-usage-tracker
```

The focused plugin commands are also available from the workspace root:

```sh
npm run typecheck --workspace bb-plugin-usage-tracker
npm test --workspace bb-plugin-usage-tracker
npm run build --workspace bb-plugin-usage-tracker
```

## Links

- [Source repository](https://github.com/MateoCerquetella/bb-plugins)
- [Issue tracker](https://github.com/MateoCerquetella/bb-plugins/issues)
- [MIT license](./LICENSE)
