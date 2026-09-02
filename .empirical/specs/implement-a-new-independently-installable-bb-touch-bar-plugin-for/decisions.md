# Decisions: BB Touch Bar Agent Monitor

## D-001: Use BetterTouchTool for cross-application persistence

Status: Superseded

Superseded by: D-006

### Evidence

Apple's public `NSTouchBar` documentation states that bars come
  from the frontmost application; BTT documents All Apps Touch Bar behavior and
  a supported Touch Bar plugin protocol.
### Options

BB frontend-only; standalone AppKit app; private Touch Bar APIs;
  BTT extension.
### Chosen approach

Use BTT and avoid private macOS APIs.

### Trade-offs and risks

Users install BTT, but the strip can remain visible while
  another application is frontmost and survives normal macOS updates better.

### Verification

Contract tests and one documented physical All Apps setup on an Intel Mac.

## D-002: Ship a Swift Source Plugin, not preset JSON or a binary bundle

Status: Superseded

Superseded by: D-006

### Evidence

Current BTT documentation calls single-file Swift source plugins
  the recommended approach, compiles them locally with its bridging header, and
  does not require notarization. Preset JSON is broader, user-stateful, and not
  a stable source contract.
### Options

Exported preset; notarized `.btttouchbarplugin`; Swift source.

### Chosen approach

Commit one auditable `.swift` source companion and installer.

### Trade-offs and risks

Xcode Command Line Tools and one explicit BTT approval are
  required; no Apple signing identity or opaque generated preset is required.

### Verification

Source metadata and installer contract tests plus target-Mac compilation.

## D-003: Keep BB authoritative and expose a versioned bounded CLI snapshot

Status: Accepted

### Evidence

BB plugin CLI handlers run server-side and can use the public
  threads SDK; BTT plugins can run local processes.
### Options

Companion reads BB files/database; unauthenticated HTTP; BB CLI.

### Chosen approach

Use `bb touchbar snapshot/open/stop` and never access BB storage
  internals from Swift.
### Trade-offs and risks

Refreshes require a healthy BB CLI/server connection, but auth,
  remote-server routing, and thread semantics remain BB-owned.

### Verification

Harness tests assert exact SDK calls and bounded JSON.

## D-004: Expose stop in CLI but only open on the physical strip

Status: Accepted

### Evidence

A Touch Bar is easy to trigger accidentally and offers limited
  confirmation space.
### Options

Tap-to-stop; long-press stop; open-only buttons.

### Chosen approach

Thread buttons open BB. Stop remains an explicit guarded CLI
  command for automation and future confirmed UI work.
### Trade-offs and risks

The MVP has fewer direct controls but no accidental termination.

### Verification

Source and behavior tests prove physical buttons dispatch only open.

## D-005: Verify UI contract without pretending Linux CI has Touch Bar hardware

Status: Superseded

Superseded by: D-006

### Evidence

The repository executes on non-macOS hosts, while BTT compiles
  source locally on the target Mac.
### Options

Skip companion checks; require hardware CI; contract-test source
  and fixture behavior.
### Chosen approach

Contract-test Swift metadata/process safety/fixtures and document
  one physical import step for an Intel Mac.
### Trade-offs and risks

Automated evidence proves integration structure, not pixels on
  a physical OLED strip; the explicit human step closes that platform gap.

### Verification

Automated source/fixture checks and a documented physical verification checklist.

## D-006: Support native finger scrolling with BTT as the public-API alternative

Status: Accepted

Supersedes: D-001, D-002, D-005

### Evidence

- The user explicitly approved the native repair on 2026-09-02 and required
  finger scrolling without paging arrows.
- The enrolled Intel Mac compiled and installed the source-built app, and its
  runtime log recorded a physical card tap followed by a successful exact-id BB
  open.
- The package still includes the BetterTouchTool Swift plugin, installer, and
  All Apps preset as the non-private compatibility path.

### Options

1. Remove the native companion and require BetterTouchTool.
2. Keep pager arrows in the native companion.
3. Keep both companions, document the private-API boundary, and use a native
   horizontal scroll view that delegates taps to its child controls.

### Chosen approach

Choose option 3. The native companion is the direct, no-BTT path requested by
the user; BetterTouchTool remains the supported public-API alternative. The
native lane must be finger-scrollable, show no pager arrows, and must not
override the scroll view's hit-test or mouse-down path.

### Trade-offs and risks

The direct companion depends on private DFRFoundation APIs and may need changes
after macOS updates. The BTT alternative avoids that dependency but requires a
third-party application. Both paths keep BB authoritative through argument-array
CLI calls.

### Verification

Build and install on the enrolled Intel Mac, confirm the runtime identifies the
finger-scroll build, physically swipe the lane and tap a thread card, and retain
contract tests that reject pager arrows and scroll-view input interception.
