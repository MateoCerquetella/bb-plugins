# Design: resilient native polling

Keep one `AgentStore` polling loop. Replace the fixed two-second sleep with a
bounded retry delay that resets after every valid snapshot and grows only while
failures continue. Publish the stale snapshot as disconnected once the existing
threshold is reached, but never stop the loop. Log transitions into and out of
reconnecting so a long-running Mac session can be diagnosed.

Keep `BBCommand` bounded and synchronous per poll; no second poll may start
until the first command has returned or timed out. Add a deterministic delay and
command-outcome seam around the store's retry decision so unit tests can prove
failure, backoff, retention, and recovery without a Mac.

No server/API or snapshot schema changes are needed.
