<p align="center">
  <img src="./assets/icon.svg" width="64" height="64" alt="Usage Tracker icon" />
</p>

<h1 align="center">Usage Tracker for BB</h1>

<p align="center">
  Codex and Claude Code limits, always visible in BB's sidebar footer.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/bb-plugin-usage-tracker"><img src="https://img.shields.io/npm/v/bb-plugin-usage-tracker?style=flat-square" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/BB-%E2%89%A5%200.36-7c3aed?style=flat-square" alt="BB 0.36 or newer" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

Usage Tracker adds one compact, live strip beside BB's existing sidebar
utility icons. Claude Code and Codex each show a progress bar and their current
usage reading, without adding a navigation item or a separate plugin page.

## Features

- Shows Codex and Claude Code subscription usage in BB's sidebar footer.
- Expands either provider to show its five-hour and weekly percentages.
- Includes reset timing and provider session status in the expanded view.
- Refreshes automatically every five minutes and whenever a stale BB window
  becomes active again.
- Provides a manual refresh button for both providers.
- Preserves last-known limit windows through temporary errors, expired
  sessions, and rate limits.
- Cleans up its UI on plugin reload, disable, or removal and works alongside a
  custom thread list such as t3sidebar.

## Install

Usage Tracker requires BB 0.36 or newer. Install the public npm package:

```sh
bb plugin install npm:bb-plugin-usage-tracker
```

The strip appears in the bottom of the sidebar as soon as the plugin loads.
The provider CLIs must be installed and signed in for BB to report their usage:

```sh
codex login
claude
```

If a CLI is missing, signed out, or expired, expand that provider in the strip
to see the recovery instruction reported by BB.

## Use

The collapsed strip is designed for quick scanning:

- Select the Claude Code or Codex reading to open its details in place.
- Review the full **5-hour limit**, **weekly limit**, and their reset times.
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

The plugin reads BB's local `system.usageLimits` data and does not ask for or
store provider credentials. Its only persistent browser data is the last
successful usage snapshot in local storage, used to keep useful values visible
during a temporary provider or network failure.

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

- [npm package](https://www.npmjs.com/package/bb-plugin-usage-tracker)
- [Source repository](https://github.com/MateoCerquetella/bb-plugins)
- [Issue tracker](https://github.com/MateoCerquetella/bb-plugins/issues)
- [MIT license](./LICENSE)
