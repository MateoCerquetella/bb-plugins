# Security Consult

- Specialist: security
- Verdict: blocking

## Finding 1: The Plan helper still receives dangerous ambient authority

- Severity: High
- Category: Prompt injection / excessive privilege
- Location: `spec.md` AC-3 and AC-5; `design.md` “Strict native Plan issue drafting”; `deltas/board-capture.md` “Composer-assisted create remains available”
- Exploit: A repository can contain instructions crafted for the drafting model. The helper is nevertheless started with `accept-edits`, and the only stated restraint against implementation is prompt text plus a provider-advertised Plan action. If the provider implements Plan imperfectly, or exposes shell, network, or filesystem tools while planning, injected repository content can induce local edits, secret reads, subprocesses, or outbound disclosure before envelope validation and before the user confirms issue creation. Hiding the helper and delaying issue persistence do not contain those effects.
- Recommendation: Make a BB-enforced least-privilege execution boundary a precondition to spawning: read-only access only to an explicit repository-context allowlist, with writes, subprocesses, network, and external mutations disabled independently of model compliance. If that capability is unavailable, fail closed to the original-prompt fallback. Add an adversarial repository test that attempts each forbidden effect. This is the smallest safe fix; changing the wording of the prompt is not sufficient.

## Finding 2: Allowlisted variable names can still redirect GitHub credentials

- Severity: High
- Category: Credential exfiltration / confused deputy
- Location: `spec.md` AC-6; `design.md` “GitHub CLI process boundary”; `deltas/taskboard-github-cli.md` “Fixed executable and deliberate child environment”
- Exploit: The design limits which environment names reach `gh`, but it does not establish trusted provenance for their values. An attacker-influenced `GH_HOST` or config root can redirect operations to another host, while a malicious proxy combined with a custom CA can intercept a token-bearing connection. Path-valued config, keyring, and CA variables can also point back into the untrusted project. The exact-name allowlist therefore can carry both a credential and the controls needed to redirect it.
- Recommendation: Bind each token to an explicitly configured host/account and reject a command whose resolved host does not match that binding. Source proxy, CA, host, config, and keyring settings only from trusted user/daemon configuration; require absolute canonical paths outside the project, safe file types and ownership, and validated host/proxy syntax. Do not inherit repository selection such as `GH_REPO` or derive a host from repository content.

## Finding 3: A fixed path does not prove that the `gh` executable is trusted

- Severity: High
- Category: Executable substitution / time-of-check to time-of-use
- Location: `design.md` “GitHub CLI process boundary”; `deltas/taskboard-github-cli.md` “Fixed executable and deliberate child environment”
- Exploit: “Absolute,” “non-project,” “regular,” and “executable” do not exclude a symlink, a user- or attacker-writable install directory, unsafe ancestors, or replacement between verification and spawn. A substituted binary is then deliberately handed the allowlisted GitHub tokens and configuration.
- Recommendation: Canonicalize the candidate, validate the file and every ancestor against platform ownership/ACL and writability rules, and reject unsafe links and user/project-writable locations. Execute the verified file identity rather than re-resolving the pathname where the platform permits; otherwise revalidate identity immediately before spawn and fail closed. Cover symlink, writable-ancestor, and swap-race cases in the cross-platform contract tests.

## Finding 4: The authoritative release probe can verify a tree that will not be tagged

- Severity: High
- Category: Artifact provenance / verification bypass
- Location: `design.md` “Production-only frontend build” and “Verification and release gate”
- Exploit: The probe is specified to apply tracked and “validated” untracked product changes to a clone. An untracked replacement can make tests or the production build pass, or execute during install/build, while the final commit and eventual tag omit that file. The resulting release would not be the artifact that passed the consumer probe.
- Recommendation: Make the final release gate reject product dirt and build only an archive/clone of the exact committed object that will be tagged, recording and comparing its commit and tree IDs. An overlay-capable probe may remain as a non-authoritative development check, but it must be followed by the clean commit-only probe.

## Finding 5: Idle output is an alternate path around native-Plan correlation

- Severity: Medium
- Category: State-machine bypass / untrusted output confusion
- Location: `design.md` “Strict native Plan issue drafting,” specifically “idle compatible output remains a bounded fallback”; `deltas/board-capture.md` unsupported-provider and interaction scenarios
- Exploit: Repository text can contain a valid tagged draft envelope and induce the model to echo it as ordinary idle output without producing the expected native Plan interaction. Accepting that output contradicts the fail-closed interaction requirement and lets attacker-authored content acquire the appearance of a captured Plan. A strict JSON shape authenticates syntax, not origin.
- Recommendation: Remove the idle-output acceptance path. Accept exactly one size-bounded envelope only from the recorded helper thread, provider, command, and native Plan interaction ID; reject missing, duplicate, stale, or out-of-order interactions and restore the original prompt.

## Finding 6: The marketplace range is a floor, not an immutable reviewed artifact

- Severity: Medium
- Category: Supply-chain version drift
- Location: `spec.md` AC-8; `design.md` “Version and marketplace alignment”; `deltas/taskboard-distribution.md` “Marketplace range alignment”
- Exploit: `^0.3.3` admits later `0.3.x` releases. A future compromised or malicious patch tag can therefore become selectable without changing the reviewed marketplace entry. The content-hashed icon does not bind the plugin source, and an annotated but unsigned/movable tag does not by itself establish immutable source identity.
- Recommendation: Prefer an exact `0.3.3` source selection bound to the reviewed tag object, commit, or content hash. If marketplace policy requires a compatible range, explicitly accept that trust model and require protected immutable tags, verifiable release provenance, and review of each newly resolvable release before catalog refresh.
