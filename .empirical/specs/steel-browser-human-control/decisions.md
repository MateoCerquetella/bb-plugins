# Decisions

## D-001: Reuse the local viewer bridge and persistent profile

Status: Accepted

### Evidence
The live player implements clipboardBridge; the project already owns a
persistent Chromium volume. Account labels are not equivalent to API tokens.

### Options
1. Build a new credential-bearing RPC and player.
2. Use the existing player bridge with validated frontend messages.

### Chosen approach
Use the bridge, a single viewer component, and explicit project account labels.

### Trade-offs and risks
The upstream paste transport is character-based. Bound input and reject control
characters. Browser clipboard permissions may fail; retain native paste.
User-confirmed account records can expire and must not claim verified auth.

### Verification
Unit tests for validation and isolation; mocked UI/browser tests with dummy
clipboard values, plugin build/typecheck and workspace checks.

## Clipboard Bridge
Accepted: live self-hosted player source implements clipboardBridge=true,
triggerPaste, triggerCopy and requestClipboardWrite. Use its existing transport,
not a credential-bearing plugin RPC. The upstream sends characters as key
events; reject control characters in login paste to avoid accidental Enter/Tab.
Copy requires explicit pending intent; ignore unsolicited read/write messages.

## Accounts
Accepted: Kernel uses saved profiles; this plugin already has dedicated
persistent Chromium volumes. BB Taskboard connection settings are API connector
credentials, not website login state, so do not conflate them.
Store user-confirmed labels and timestamp, not cookie-derived "verified" auth.
Expired sign-ins remain possible; mark the status honestly.

## Performance
Accepted: page login currently mounts two players and old directives keep
iframes alive. Eliminate both. Cache/coalesce short dashboard reads to reduce
repeated health/Connect calls. Do not promise WebRTC or a measured FPS gain:
the installed self-hosted player uses Chrome screencast over WebSocket.

## Launcher
The previous fix changed a host-local launcher, not repository code. Document
the generic BB_CLI remedy rather than committing user-specific paths.
