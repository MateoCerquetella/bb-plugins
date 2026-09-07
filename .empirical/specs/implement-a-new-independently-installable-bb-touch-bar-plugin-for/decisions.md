# Decisions: BB Touch Bar Agent Monitor

## D-001: Use BetterTouchTool for cross-application persistence

Status: Accepted

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

Status: Accepted

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

Status: Accepted

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
