# Security Consult

- Specialist: security
- Verdict: advisory

## Assessment

The revised capability removes Taskboard's repository-to-model execution path
rather than trying to constrain it with prompt text. Composer capture is now a
deterministic local transformation of user-authored text, and the external issue
remains behind an explicit editable review and Create action. The specification
also makes the clean committed HEAD commit and tree the authoritative release
input; working-tree overlays are explicitly non-authoritative.

No security blocker remains in the described no-AI drafting or committed-only
release flow. The two residual risks below are retained trust-policy choices and
should remain visible in release evidence.

## Finding 1: The retained GitHub CLI boundary still trusts host-controlled state

- Severity: Medium
- Category: Credential boundary / local host trust
- Location: `spec.md` AC-6 and Non-goals; `design.md` “Retained release fixes”; retained GitHub CLI contract
- Observation: The change preserves fixed absolute executable candidates and an
  explicit authentication, configuration, proxy, TLS, and runtime environment
  allowlist. Those controls prevent project `PATH` injection and broad ambient
  secret inheritance, but the design does not claim that allowlisted values or
  executable locations are independently authenticated against a hostile local
  user or administrator.
- Exploitability: After removal of repository-aware model execution, ordinary
  repository contents have no path to alter the BB server environment or replace
  a fixed GitHub CLI installation. Redirection or executable substitution would
  require control of host launch configuration, credential-routing state, or an
  allowed installation path. That authority is already inside BB's local
  full-trust boundary and would normally permit direct credential or plugin
  compromise.
- Recommendation: Record this host-user trust assumption in release evidence and
  retain the exact environment/candidate regression tests. A later defense-in-
  depth change may pin the GitHub hostname, canonicalize and revalidate executable
  identity immediately before spawn, and reject unsafe path ownership or
  writability, but it is not required to make the no-AI drafting change safe.

## Finding 2: The compatible marketplace range can select future patch releases

- Severity: Medium
- Category: Supply-chain version drift
- Location: `spec.md` AC-9 and Risks; `design.md` “User-facing and marketplace copy”; `deltas/taskboard-distribution.md` “Marketplace range alignment”
- Observation: `^0.3.3` intentionally permits a later compatible `0.3.x` tag to
  become resolvable without changing the reviewed marketplace entry. The exact
  commit/tree release probe proves the `0.3.3` candidate, but it does not
  automatically review future tags admitted by the range.
- Exploitability: This requires a future release or tag under the source
  maintainer's authority; repository content in an installed user project cannot
  influence marketplace resolution. The risk is therefore release-governance
  drift rather than a runtime Taskboard attack.
- Recommendation: Keep release tags immutable and protected, preserve verifiable
  commit provenance, and review every newly resolvable patch before marketplace
  refresh. If that governance cannot be maintained, use an exact reviewed
  version instead of a compatible range.

## Required verification evidence

- Static searches show no Taskboard drafting RPC, model/provider invocation,
  Plan action, hidden helper thread, `threads.spawn`, polling/retry state, or AI
  copy remains.
- Composer capture displays the original prompt-derived title and description as
  editable fields and performs no external mutation before explicit Create.
- The default promotion command refuses tracked and untracked product dirt,
  proves clone HEAD commit/tree identity, and runs the production-only build;
  `--allow-working-tree` is never used as release evidence.
- GitHub CLI environment and fixed-candidate regression tests continue to pass,
  and release evidence records the accepted host-trust boundary.
- Marketplace evidence identifies the exact reviewed `0.3.3` commit and tag and
  records the compatible-range governance requirement.
