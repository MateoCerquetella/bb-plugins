# Decisions

## D-001: Keep the PR as one delivery slice

Status: Accepted

### Evidence

The Keychain override and the stale Usage Tracker distribution assertion are
both required for PR #48 to pass the repository check and neither can ship
independently from this branch.

### Options

Split provider behavior and distribution metadata into separate branches; keep
the coupled fixes in one reviewed branch.

### Chosen approach

Keep one slice and review the behavior and release metadata together.

### Trade-offs and risks

The contract exceeds the normal size guardrail, but splitting would create an
intermediate state that cannot satisfy CI or deliver the requested PR.

### Verification

Focused Usage Tracker tests, distribution assertions, root checks, and exact
head CI all cover the combined slice.

## D-002: Bound the local token override

Status: Accepted

### Evidence

The PR reads a user-selected Keychain service and sends its token to Anthropic.
The service name and error boundary are therefore sensitive inputs.

### Options

Keep the permissive suffix and raw caught error text; validate the exact service
shape and return fixed safe messages.

### Chosen approach

Accept only the default Claude service or an eight-hex suffixed service, invoke
`security` with argumentized input, use the fixed Anthropic URL, and sanitize
transport and parse failures.

### Trade-offs and risks

Some unusual but valid future service formats would need an explicit code
change, which is preferable to broad token disclosure.

### Verification

Injected tests cover malformed names, command arguments, headers, malformed
responses, transport failures, and absence of token material from results.

## D-003: Keep remote-host usage authoritative

Status: Accepted

### Evidence

`loadUsageSnapshot` can resolve a thread to a remote host, while the configured
Keychain item belongs to the server machine. Applying it to every thread would
misattribute local usage to remote work.

### Options

Apply the override for all snapshots; apply it only when loading the primary
machine snapshot.

### Chosen approach

Gate the override on the primary-machine path and leave remote host responses
unchanged.

### Trade-offs and risks

Users must configure the plugin separately on each machine whose local usage
they want to override, which preserves host ownership.

### Verification

Add a remote-thread regression case and inspect the RPC composition.

## D-004: Advance Usage Tracker to 0.1.10 without publishing

Status: Accepted

### Evidence

The active manifest is `0.1.9`, while CI's distribution test still expects
`0.1.8`; the user asked for a version update but not publication.

### Options

Leave the version unchanged; publish; prepare a synchronized local patch bump.

### Chosen approach

Update active local version assertions and changelog to `0.1.10`, without npm,
tag, or GitHub Release mutation.

### Trade-offs and risks

The next public Git release still requires a separate tag and release approval.

### Verification

Run the distribution test and confirm no release/tag was created.
