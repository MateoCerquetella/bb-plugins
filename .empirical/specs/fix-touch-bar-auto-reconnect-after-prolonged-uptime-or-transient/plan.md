# Plan: resilient native polling

1. Extract retry scheduling from `AgentStore.start`, add bounded backoff, and
   reset the delay/failure streak on a valid snapshot.
2. Log reconnect enter/recovery transitions and preserve the last good snapshot
   during failures.
3. Add deterministic unit coverage for timeout/nonzero/malformed failures,
   backoff bounds, one-loop behavior, and successful recovery.
4. Run plugin/root checks, rebuild/install on the Intel Mac, exercise a transient
   failure/recovery path, record evidence, review, and integrate.
