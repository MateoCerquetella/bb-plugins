# Decisions

## D-001: Decouple output capture from pipe EOF

Status: Accepted

### Evidence
`BBCommand.run` reads to EOF after termination, while its comment documents helper descendants that may remain alive and retain the pipe writer.
### Options
Continue synchronous EOF reads; use a temporary file; or drain with a readability handler.
### Chosen approach
Use a readability handler with locked, size-bounded accumulation, then detach it without requiring EOF.
### Trade-offs and risks
This adds synchronization code but avoids temporary files and descendant-dependent completion.
### Verification
Source contracts require bounded asynchronous capture and prohibit EOF-dependent reads.

## D-002: Bound process cleanup

Status: Accepted

### Evidence
`terminate()` followed immediately by `waitUntilExit()` has no upper bound.
### Options
Trust SIGTERM; block until exit; or add a grace period and SIGKILL fallback.
### Chosen approach
Use a short grace period and SIGKILL the exact launched PID if still running.
### Trade-offs and risks
A timed-out read command may be forcibly killed, preventing a permanent monitor wedge.
### Verification
Source contracts require the bounded grace and forced-kill path.

## D-003: Retain existing UI recovery semantics

Status: Accepted

### Evidence
AgentStore already marks the last good snapshot disconnected after three failures and publishes a later success.
### Options
Add parallel pollers, add UI timers, or repair the blocked command boundary.
### Chosen approach
Repair the command boundary and keep the single polling loop.
### Trade-offs and risks
This avoids overlapping CLI processes and state races.
### Verification
Existing recovery state plus new command-runner regression contracts cover the path.
