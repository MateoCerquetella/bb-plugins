# Decisions: Fix Touch Bar Auto Reconnect After Prolonged Uptime Or Transient

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

The store currently marks disconnected after three failures, but retries every
two seconds with no backoff or explicit recovery logging. Long-running Mac
sessions can therefore show stale reconnecting state while BB is healthy again.

### Options

1. Stop polling after the failure threshold and require a manual restart.
2. Retry continuously at a fixed interval with no state instrumentation.
3. Keep one poll loop, add bounded exponential backoff, reset on success, and
   expose injectable command/timing seams for tests.

### Chosen approach

Choose option 3. The last good snapshot remains visible, failure delays grow to
a bounded ceiling, and any valid response immediately restores connected state.

### Trade-offs and risks

Recovery can take slightly longer during a sustained outage, but bounded
backoff avoids process churn and prevents a busy loop. The app still depends on
the configured BB executable and server connection.

### Verification

Inject failures, timeouts, malformed output, and success; assert retention,
backoff bounds, one loop, and connected recovery. Verify on the enrolled Mac.
