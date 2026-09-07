# Design

## Diagnosis

`BBCommand.run` waits for the launched process and then calls `readDataToEndOfFile()` on its stdout pipe. The source itself notes that BB may leave a helper child alive. If that child inherited stdout, the pipe never reaches EOF, so the AgentStore's only serial polling queue blocks forever. Its last published snapshot remains disconnected and the panel displays “Reconnecting…” indefinitely.

## Implementation

- Drain stdout while the process runs with `FileHandle.readabilityHandler`, accumulating no more than the existing 65,536-byte protocol bound.
- After the launched process exits, detach the handler and synchronize access to the captured bytes; do not perform an EOF-dependent read.
- On deadline expiry, send termination, wait only for a short cleanup deadline, then hard-kill the launched PID if necessary. Never make cleanup an unbounded wait.
- Preserve the existing behavior that accepts complete, nonempty JSON emitted before a timed-out wrapper exits.
- Keep AgentStore's failure threshold and last-good snapshot behavior; once the runner can return, its existing polling loop naturally retries and publishes `connected: true` on success.

## Verification

- Extend native source-contract tests to require asynchronous bounded stdout capture, absence of `readDataToEndOfFile`, and bounded terminate/kill cleanup.
- Run the Touch Bar workspace check and package/clean checks.
- A real native build/runtime smoke requires macOS AppKit and physical Touch Bar access and will be reported separately if this Linux workspace cannot provide them.
