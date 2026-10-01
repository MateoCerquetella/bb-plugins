# Decisions: Install And Run Https Github Com Steel Dev Steel Browser

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
