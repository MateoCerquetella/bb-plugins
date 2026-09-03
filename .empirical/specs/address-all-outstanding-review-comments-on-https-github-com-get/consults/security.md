# Security Advisory

- Specialist: security
- Verdict: advisory

## Findings

- Severity: low
  - Category: supply-chain integrity
  - Location: `design.md` source repository changes and release delivery
  - Finding: Moving third-party libraries into production dependencies makes
    their installed code part of Dockside's runtime trust boundary. A release
    built without the reviewed lockfile, or a mutable release tag, could select
    code other than the code verified for the submission.
  - Recommendation: Keep the dependency ranges lockfile-bound, run the clean
    consumer and repository checks from the release commit, refuse publication
    if `dockside/v0.1.1` already exists, and verify the public peeled tag commit
    after publication.

- Severity: informational
  - Category: authorization and remote mutation
  - Location: `design.md` release and marketplace delivery
  - Finding: Source/tag pushes, marketplace-branch pushes, and PR comments act
    through the authenticated maintainer account and cannot be safely inferred
    from local test success alone.
  - Recommendation: Preserve the explicit approval gate with exact account,
    repository, commit, version, tag, branch, and commands before any remote
    mutation; verify each remote ref immediately afterward.

## Exploit Review

The change adds no runtime input parser, credential path, network endpoint, or
dangerous sink. Its material security boundary is release provenance: malicious
or accidentally substituted dependency code could execute during Dockside's
build or runtime. The committed lockfile, isolated production-install check,
immutable version tag, public peeled-ref verification, and approval-gated remote
commands are the smallest controls that close that path. No blocking finding
remains.
