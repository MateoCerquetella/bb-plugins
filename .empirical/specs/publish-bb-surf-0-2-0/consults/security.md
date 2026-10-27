# Security Advisory

- Specialist: security
- Verdict: advisory

## Findings

- Severity: low
  - Category: supply chain / release integrity
  - Location: `get-bb/marketplace` `entries/steel-browser.json` `source.git.range`
  - Finding: a caret range (`^0.2.0`) makes every future `steel-browser/v0.2.x`
    tag installable without another catalog review. The previous release shows
    why that matters: `steel-browser/v0.1.1` was cut from an unmerged branch, so
    a tag is not evidence that its tree is the reviewed line. Anyone able to
    push a tag in the plugin repository can therefore publish code to users of
    this entry.
  - Recommendation: keep tags on commits merged into `main` (this release is,
    verified with `git merge-base --is-ancestor`), keep repository and tag push
    access to the plugin owner, and prefer a minor range bump over widening a
    caret range across release lines.

- Severity: informational
  - Category: credentials
  - Location: BB plugin secrets `jevApiKey`, `jevTextModelApiKey`
  - Finding: the release commit carries no credential material; the packet diff
    contains no key-like strings, and `bb plugin config` reports both keys as
    `[set]` without echoing values. The release does not read, write, log, or
    transport those secrets.
  - Recommendation: keep the local installation on its path source so the saved
    secrets are not deleted by a source replacement, and keep paid Jev runs
    behind the existing explicit `--allow-paid` authorization.

- Severity: informational
  - Category: distribution trust boundary
  - Location: `plugins/steel-browser/package.json`, root `package-lock.json`
  - Finding: the version bump changes no runtime code, no dependency, and no
    install script. The published artifact is the already-reviewed merged tree
    plus a manifest version change, so the attack surface of an update is
    limited to the engine code that PR #102 already shipped.
  - Recommendation: no action. Note in review that a future release which does
    change `dependencies`, `scripts`, or `engines` deserves its own audit.

## Exploit Review

The reachable attacker here is not a remote request handler but anyone with
write access to the plugin repository's tags, because marketplace installs
resolve a range rather than a pinned digest. That actor could publish code
through a future `v0.2.x` tag without a new catalog PR. No credential is
exposed by this change, no authentication or authorization path is touched, and
the local host keeps its secrets because the installation source is unchanged.
Residual risk is ordinary release-process trust, mitigated for this release by
tagging a merged commit and by the plugin check gate on the release commit.
