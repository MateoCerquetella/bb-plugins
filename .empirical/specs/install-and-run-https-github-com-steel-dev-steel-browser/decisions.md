# Decisions: Install And Run Https Github Com Steel Dev Steel Browser

## D-003: Isolated Project Instances

Status: Accepted

### Evidence
Installed Steel session.service.ts chooses a fixed directory when
userDataDir is supplied, and serves one current browser. BB provides projectId
in thread metadata. The user requested distinct project cookies and engines.

### Options
Swap shared browser cookies, rely on userDataDir, or dedicate instances.
### Chosen approach
Dedicated containers and profile volumes with immutable project
bindings; fail closed on unconfigured projects. Supersedes global viewer routing.
### Trade-offs and risks
More memory per open project and explicit host provisioning.
### Verification
Two independent fixture cookies persist without crossing profiles;
project resolver and binding tests prevent accidental reuse.

## D-004: Engine Safety And Compact Inline UI

Status: Accepted

### Evidence
User approved neutral UI and requested smaller 560px viewer, engine
selection and fallback. Jev live runs require external potentially paid calls.
### Options
Retry arbitrary failures, or fallback only before execution begins.
### Chosen approach
Persist project engine preference and fallback separately;
preflight-only fallback, with paid execution opt-in. Preserve the neutral UI.
### Trade-offs and risks
No automatic recovery after uncertain browser actions.
### Verification
Preflight failures may fallback; execution failures may not.

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
# D-005 Tools Without Project Context

- Evidence: BB Tools supplied no project ID and serialization rejected undefined.
- Options: guess a project; suppress serialization only; or fail closed in UI.
- Decision: fail closed before RPC and retain host configuration.
- Trade-off: no project policy edits from a context-free Tools surface.
- Verification: browser coverage with and without project scope.

# D-006 Top-Level Connect Authentication

- Supersedes D-002 only for BB Connect authentication: OAuth must open outside
  the viewer iframe. Website login inside the remote Chromium is separate.
- The native thread directive exposes a sign-in link with noopener/noreferrer
  and a Done control that reloads the embedded player.
- Do not wrap the viewer in generic inline-vis: it adds an opaque sandbox.
- API session availability is not proof that the viewer is authenticated.
- Popup, opener isolation, and reload regression coverage added; execution
  pending. Full GitHub login requires the user's interactive authentication.

# D-007 Context-Free Dashboard

- Extends D-005 to the full Steel page: without a thread or project, do not
  mount the operational dashboard or expose session mutation controls.
- Retain host-side Jev configuration and the project-unavailable state.
- The shared viewer hook also refuses empty scope before RPC. Request failures
  show unavailable instead of indefinite connection and endpoint loading.
- Regression fixture now mounts the full context-free page, not settings alone.
  Test execution remains pending under the iterative policy.

# D-008 Automatic Project Setup And In-Thread Browsing

- Supersedes D-003's manual-only setup: the project and run CLI commands now
  ensure a dedicated project container and immutable binding on demand.
- Overview/settings reads stay read-only. Setup is serialized; existing
  containers are checked before reuse, and collisions fail without deletion.
- Select the server host explicitly for Connect even for remote-thread calls.
  Never expose CDP or reuse a port already shared through Connect.
- Supersedes D-006's external sign-in fallback: agents and viewer controls stay
  in-thread. Report iframe authentication restrictions without opening Safari.
- New-session instructions advertise the CLI and automatic binding, while
  preserving explicit authorization for paid calls and project isolation.
