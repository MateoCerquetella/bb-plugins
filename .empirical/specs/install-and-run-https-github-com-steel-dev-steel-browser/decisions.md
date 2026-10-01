# Decisions: Install And Run Https Github Com Steel Dev Steel Browser

## D-002: Show The Browser

Status: Accepted

### Evidence

The user's screenshot and explicit request supersede the original decision
to omit a viewport. Inspection confirms `/v1/sessions/debug` returns Steel's
canvas-based Session Player, whereas `/ui` is a dashboard.

### Options

Embed the upstream player or build a separate screencast transport.

### Chosen approach

Embed the existing player behind an explicit play control with an external
authenticated fallback. Do not label scripted automation as jev.

### Trade-offs and risks

Remote iframe authentication can fail; provide the same player in a new tab.

### Verification

Verify player pixels locally and BB layout on desktop/mobile; remote
authenticated embedding must not be claimed verified without evidence.

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

* The host already has Docker 29.7.2 and Compose 5.4.0.
* Port 3000 is occupied by Empirical Forge, so Steel needs a loopback remap.
* Upstream documents the combined image and the `/v1/sessions` lifecycle.
* The repository's plugin convention is package-layout with `server.ts`,
  `app.tsx`, strict contracts, tests, and an SDK devDependency.

### Options

1. Run upstream Steel through Docker Compose with a pinned image digest.
2. Build Steel from source and run its Node development stack.
3. Use Steel Cloud or expose a public tunnel.

### Chosen approach

Use the pinned upstream combined Docker image with loopback port remapping,
persistent named volumes, and a user-service restart policy. Add a focused
BB plugin client rather than embedding Steel or exposing a generic proxy.

### Trade-offs and risks

The image depends on Docker and Chrome resources; restart and health checks
cover transient failures. Loopback binding avoids accidental public exposure.
The plugin intentionally supports only health and session lifecycle, leaving
advanced Steel endpoints available through its own local documentation link.

### Verification

Inspect the image digest and bindings, restart the service, run real
health/create/list/release requests, then run plugin type/build/contract checks,
local install/reload, CLI smoke checks, and browser UI verification.
