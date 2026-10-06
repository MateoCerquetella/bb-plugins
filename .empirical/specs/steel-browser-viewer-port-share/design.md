# Design

Keep local browser liveness and viewer transport repair separate. The server's
existing readiness callback first probes API/CDP, then calls a small
`ensureViewerShare` helper. The existing project cache coalesces concurrent
requests and bounds repeat checks to ten seconds.

The helper lists Connect shares explicitly on the Steel host. A matching API
port and origin needs no mutation. A missing share first validates the project's
running dedicated container using the existing verifier, then exposes only the
API port on that host. Both existing and returned origins must exactly match the
saved HTTPS viewer origin. Connect errors propagate rather than returning false:
they must not enter container recreation. Cache success occurs only after both
browser liveness and share readiness succeed.

No RPC, frontend, profile, session or dependency changes are needed. Add
dependency-injected helper tests and project cache/retry coverage. Verify the
installed backend's CLI and the real viewer transport.
