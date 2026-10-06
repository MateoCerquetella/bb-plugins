# Decisions

## D-001: Separate share recovery from container repair

Status: Accepted

### Evidence

`bb steel-browser status` reports a healthy API at port 3210 while
`bb connect shares --json` omits that port. `ProjectBrowsers.ensure` bypasses
provisioning whenever `bindingReady` succeeds; only provisioning currently
restores the Connect share.

### Options

1. Always run full provisioning.
2. Probe the authenticated public viewer.
3. Check and repair host-side share registration.

### Chosen approach

Choose a share-specific check in the healthy readiness callback. Always running
full provisioning would repeatedly inspect Docker and could unnecessarily enter
container lifecycle repair. Probing the HTTPS viewer is unsuitable because its
authentication gate is distinct from host-side share registration.

### Trade-offs and risks

Recovery can take up to the existing ten-second cache expiry. A Connect outage
will report a readiness error even if local API/CDP remain healthy. This is
intentional: no ready viewer can be promised. Explicit host selection and
container validation protect against exposing a wrong service.

### Verification

Test matching/missing shares, exact host and port, origin mismatches, validation
and Connect failures, coalescing, retries and cache expiry. Run focused plugin
checks, install/reload locally, inspect actual shares and browser. Use PR CI for
repository-wide verification before merge.
