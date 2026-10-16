# Decisions: Taskboard Empirical Live Visibility

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Observe Empirical on the native task's owning host

Status: Accepted

### Evidence

- Current `origin/main` has `factoryStartTask`, a persisted run
  `environmentId`, host-routed preparation RPC, a 2.5-second factory poll,
  and a three-second progress-panel refresh. This worktree's older base
  predates those files.
- Empirical exports `repositoryOverview`, whose worktree inventory and
  feature snapshots are read-only, bounded and journal-aware.
- A finished BB turn is already explicitly not accepted work in Taskboard.

### Options

1. Import the published Empirical read-only overview in Taskboard's host
   bundle and route exact BB environment paths to their owning hosts.
2. Parse `.empirical` JSON directly in Taskboard.
3. Shell out to whichever `empirical` executable happens to be on PATH.

### Chosen approach

Choose option 1. Preserve the native task's environment identity, validate
the host result against it, and render the Empirical snapshot as a separate
fact. Persist the last observation; derive freshness from observation time
and connectivity, never from a native turn or provider status.

### Trade-offs and risks

- The host bundle gains an Empirical runtime dependency, which must be
  build-tested against the pinned BB SDK.
- Host watches may miss Git or disconnected-host changes; periodic full
  reconciliation and reconnect refresh provide recovery.
- Invalid and offline snapshots must not overwrite previously valid facts.
- Keep this one capability despite seven criteria: a watcher without
  checkout binding and a panel is not an independently usable feature.

### Verification

- Host snapshot, service identity/freshness, and native lifecycle tests.
- Actual progress component in a browser demo at wide and narrow widths.
- Taskboard type, test, build, and installed BB UI/CLI checks.
