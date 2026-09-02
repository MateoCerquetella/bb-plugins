# BB Touch Bar Agent Monitor

An open-source native macOS companion that keeps BB agent activity available on
the Touch Bar across every application.

The BB plugin owns the bounded thread snapshot and guarded commands. A small
Swift/AppKit background app owns the physical Touch Bar:

- an always-present BB badge in the Control Strip;
- tap the badge to expand a fullscreen, paginated agent panel;
- one outlined two-line card per thread with provider, project, status colour,
  badge and activity spinner;
- tap a card to open that exact BB thread;
- optional right-side circular ChatGPT, Claude Code, and Cursor icons with usage
  progress rings instead of percentage text;
- an optional icon-only Host Monitor button that swaps the thread lane for bounded
  host cards containing compact circular CPU, RAM, disk, download, and upload
  gauges for every enrolled host;
- tap ✕ to collapse to the ordinary Control Strip;
- automatic restoration after login and wake.

No subscription, developer account, external runtime, telemetry, or proprietary
companion is required. The source builds and ad-hoc signs locally.

## Requirements

- BB 0.40 or newer.
- A MacBook Pro with Touch Bar, Intel or Apple silicon.
- macOS 11 or newer.
- Xcode Command Line Tools (`xcode-select --install`).

The persistent Control Strip and fullscreen system-modal modes rely on Apple's
private `DFRFoundation` Touch Bar entry points. They are not App Store APIs and
may require adaptation after a macOS update. The app tears down modal state
before termination so it does not strand a black Touch Bar.

## Install the BB plugin

Install this package on the machine running the BB server—not from a remote
Mac filesystem path:

```sh
bb plugin install ./plugins/touchbar
bb plugin reload touchbar
bb touchbar snapshot --pretty
```

The managed Git form after a tagged release is:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.1.0 --subdirectory plugins/touchbar --tag-prefix touchbar/
```

## Install the native app

### Homebrew Cask

After a `touchbar/vX.Y.Z` release is published with its universal archive, add
this repository as a tap and install the macOS app:

```sh
brew tap mateocerquetella/bb-plugins \
  https://github.com/MateoCerquetella/bb-plugins.git
brew install --cask mateocerquetella/bb-plugins/bb-touch-bar
```

Homebrew installs `BB Touch Bar.app` in `/Applications`, records the active
`bb` CLI path, installs the per-user LaunchAgent, and starts the accessory app.
Upgrades preserve Touch Bar preferences. `brew uninstall --cask bb-touch-bar`
removes the app and login job; add `--zap` to remove its support data, log, and
preferences too.

The Cask keeps the archive in Homebrew's Caskroom, moves the `.app` into
`/Applications`, records the `bb` CLI path, and creates the per-user
`app.getbb.touchbar.native` LaunchAgent with `RunAtLoad`. The app therefore
starts after login without a Dock icon. **Open at Login** in the menu-bar
settings can remove or recreate that next-login registration.

Public Cask archives must be Developer ID signed and Apple-notarized because
current Homebrew preserves Gatekeeper quarantine and no longer offers a
`--no-quarantine` install option.

### Source install

On the Touch Bar Mac, from the extracted package:

```sh
cd ~/Downloads/touchbar
chmod +x native/*.sh
./native/install.sh
```

The installer:

1. builds `BBTouchBar.app` from the committed Swift source;
2. emits Intel and Apple-silicon slices when the local toolchain supports them;
3. links the private Touch Bar framework and ad-hoc signs the real app bundle;
4. installs it at `~/Applications/BBTouchBar.app`;
5. pins the current `bb` executable path in owner-only configuration;
6. installs a user LaunchAgent for login startup;
7. launches the app and waits for its readiness file.

The app has no Dock icon. Its BB badge appears in the Touch Bar's Control Strip.
Install and enable the repository's `host-monitor` plugin to populate the host
cards; subscription usage comes directly from BB's provider usage API.

Tap the slider button for grouped FILTERS, SUBSCRIPTIONS, and HOST MONITOR
cards directly inside the Touch Bar. Section labels sit at the left so every
control gets a full-height 30-point touch target and provider icons render at
28 points through native `NSImageView` controls that preserve logo orientation.
Settings uses a separate native Touch Bar
item and each render creates fresh controls, so AppKit never replaces or
reparents the live thread lane. The menu-bar icon remains an optional
second settings entry point. Toggle Usage and Host Monitor, choose Codex,
Claude Code, and/or Cursor, and select the thread layout. These preferences
persist per macOS user. Tap the computer icon to switch between threads and
the compact inline host metrics lane. Tap an individual host card to open that
host's detail page inside the BB desktop app.

Settings, Host Monitor, and X use fixed 34-point native controls to preserve
space for cards while retaining explicit touch dispatch.

Agent provider icons are embedded as large circular badges in every thread
card. Status uses the card outline plus a vertically centered compact text pill:
green working, amber needs-you/waiting, blue unread, red error, and gray
inactive. Provider artwork stays clean instead of carrying a second status ring.

Host CPU, RAM, and disk rings use Host Monitor's current configurable yellow
and red thresholds. Changing those settings automatically changes Touch Bar
gauge colors on the next sample; download remains red and upload blue.

When the cards do not fit, native ‹ and › controls page through the lane without
placing the thread and settings buttons inside a gesture-swallowing scroll view.
Errors whose BB attention has already been read stay available in BB but are
removed from the compact lane, so old failures do not remain pinned as new red
alerts.

## Controls

```sh
./native/run.sh status
./native/run.sh open
./native/run.sh close
./native/run.sh restart
./native/run.sh stop
```

`open` and `close` signal the running app, exercising the same panel path as a
physical tap. Logs are written to `~/Library/Logs/bb-touchbar.log`.

## BB commands

```sh
bb touchbar snapshot [--pretty]
bb touchbar card <summary|0|1|2|3|4|5>
bb touchbar open <thread-id>
bb touchbar open-card <0|1|2|3|4|5>
bb touchbar stop <thread-id>
```

The native app uses `snapshot` and exact-id `open`. `stop` is deliberately not
bound to a physical tap.

The snapshot contains only stable, bounded card fields: id, short title,
lifecycle status, provider id, project label, update time, unread state and a
small attention enum, plus compact provider usage percentages. It never exposes prompts, messages, tool output,
credentials, or filesystem paths. Hidden worker threads are excluded by
default.

Configure card count and hidden-worker visibility through BB:

```sh
bb plugin config touchbar set cardLimit 24
bb plugin config touchbar set includeHidden false
```

## Remove

```sh
cd ~/Downloads/touchbar
./native/uninstall.sh
bb plugin remove touchbar
```

The native uninstaller first collapses/dismisses the modal Touch Bar, then
stops the process, unloads its user LaunchAgent, and removes only the installed
app and launch plist. BB plugin removal is separate because the server may live
on another machine.

## Development and verification

From the repository root:

```sh
npm install
npm run check --workspace bb-plugin-touchbar
```

On a Touch Bar Mac:

```sh
./plugins/touchbar/native/build.sh
BB_TOUCHBAR_APP="$PWD/plugins/touchbar/native/build/BBTouchBar.app" \
  ./plugins/touchbar/native/run.sh start
```

Generated `build/`, `dist/`, and `node_modules/` directories remain untracked.

## Prepare a macOS release

Create the universal ZIP and matching Cask checksum on a Mac:

```sh
./plugins/touchbar/native/package.sh 0.1.0
```

For a public release, sign and notarize with Keychain-managed credentials:

```sh
BB_TOUCHBAR_SIGN_IDENTITY="Developer ID Application: Example (TEAMID)" \
BB_TOUCHBAR_NOTARY_PROFILE="bb-touchbar" \
  ./plugins/touchbar/native/package.sh 0.1.0
```

`package.sh` prints the archive path and SHA-256. Put that exact SHA in
[`Casks/bb-touch-bar.rb`](../../Casks/bb-touch-bar.rb), commit it, create the
matching `touchbar/v0.1.0` tag, and attach the unchanged ZIP as
`BBTouchBar-0.1.0-universal.zip`. Publishing the tag/release remains a separate
remote action.

## License

The plugin and native companion are MIT licensed. Required upstream license
and asset attribution remain alongside the reused material in
[`native/LICENSE.upstream`](./native/LICENSE.upstream) and
[`native/Assets/NOTICE.md`](./native/Assets/NOTICE.md).
