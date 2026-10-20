# Decisions

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Release as version 0.1.8

Status: Accepted

### Evidence

`dockside/v0.1.7` already peels to `3b3d8fd16`, and that commit does not contain
`plugins/dockside/lib/sidebar-sections.ts`. Semver ranges resolve the highest
matching tag, so the filter work cannot ship under 0.1.7.

### Options

Reuse 0.1.7; bump to 0.1.8.

### Chosen approach

Bump `plugins/dockside/package.json` to 0.1.8 and publish a new immutable tag.

### Trade-offs and risks

Users on `^0.1.0` upgrade as soon as the tag exists. No marketplace JSON change
is required.

### Verification

`node -p` on the released package, plus tag ancestry checks.

## D-002: Integrate the filter branch with a merge commit

Status: Accepted

### Evidence

`git merge-tree --write-tree HEAD origin/filter-by-bbplugins-thr_q7uptvnbap`
exits 0 with a clean tree. The branch carries six commits on a shared ancestor.

### Options

Fast-forward; `--no-ff` merge; cherry-pick the six commits.

### Chosen approach

`git merge --no-ff origin/filter-by-bbplugins-thr_q7uptvnbap`.

### Trade-offs and risks

One extra integration commit; the branch stays visible and auditable. No manual
conflict resolution is expected.

### Verification

Both the merge commit and the branch tip are ancestors of the release commit.

## D-003: Tag merged `main`, not the release branch

Status: Accepted

### Evidence

`dockside/v0.1.7` points at a feature-branch commit whose code never reached
`main`, which is why the 0.1.7 release lacks the filter work. The marketplace
reads tags, so a branch-only tag creates durable drift.

### Options

Tag the release branch immediately; merge the PR and tag `main`.

### Chosen approach

Open a PR, merge it after CI passes, then create and push `dockside/v0.1.8` on
the resulting `main` commit.

### Trade-offs and risks

The release waits for CI and review. A red check stops the release rather than
being bypassed.

### Verification

`git merge-base --is-ancestor <tag> origin/main` after the merge.

## D-004: Keep the marketplace entry unchanged

Status: Accepted

### Evidence

`entries/dockside.json` already declares `range: "^0.1.0"` with tag prefix
`dockside/`. A matching new tag resolves without editing a frozen-v1 entry.

### Options

Edit the entry; leave it.

### Chosen approach

Leave the entry and its range as-is.

### Trade-offs and risks

The listing description still updates only through the separate open PR, but
installs resolve 0.1.8.

### Verification

Install resolution returns 0.1.8 for the marketplace source form.
