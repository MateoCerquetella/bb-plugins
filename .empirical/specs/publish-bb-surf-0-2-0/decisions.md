# Decisions

## D-004: Keep the local install on its path source

Status: Accepted

### Evidence

`bb plugin source steel-browser` reports a `path:` install from the active
worktree, and `bb plugin config steel-browser` shows `jevApiKey` and
`jevTextModelApiKey` saved as secrets. Removing the plugin deletes its
settings and secrets.

### Options

- Reinstall from `steel-browser@bb-community` or the Git range to exercise the
  marketplace path, at the cost of the saved keys.
- Leave the path-source install in place and reload it.

### Chosen approach

Leave the install and reload it. The running plugin already contains the merged
engine; the tag tree plus the marketplace build cover the published path.

### Trade-offs and risks

This host does not exercise a marketplace install end to end. That gap is
covered by the tag tree check and the marketplace build, and is reported rather
than hidden.

### Verification

`bb plugin reload steel-browser`, `bb plugin list`, and
`bb plugin config steel-browser` after the release.

## D-003: Marketplace change is an entry update

Status: Accepted

### Evidence

The catalog README requires a new entry only for a source, name, or brand
change. The id, subdirectory, tag prefix, and display name stay the same.

### Options

- Add a second entry file for the release.
- Update the existing `entries/steel-browser.json` range and description.

### Chosen approach

Update the existing entry: range `^0.2.0`, description naming the selectable
Playwright and Jev engines, and a `jev` tag.

### Trade-offs and risks

A range bump only reaches users whose catalog refreshes; installations pinned
to an older resolved source keep working until they update.

### Verification

Marketplace `npm run build` validates the entry and resolves the remote source.

## D-002: Tag a merged commit, not a feature branch

Status: Accepted

### Evidence

`steel-browser/v0.1.1` resolves to `3b3d8fd16`, which is contained only by the
release branch, not by `main`. `main` still declares `0.1.0`, so the previous
tag's tree predates later merged work.

### Options

- Repeat the `0.1.1` pattern: bump on a release branch and tag there.
- Bump on a branch, merge it, then tag the merged commit after an ancestry
  check.

### Chosen approach

Bump on `release/steel-browser-0.2.0` from `origin/main`, merge the PR, then tag
a commit that `git merge-base --is-ancestor <tag> origin/main` accepts.

### Trade-offs and risks

The release needs the merge before the tag exists, so the marketplace PR comes
after that step instead of in parallel.

### Verification

`git merge-base --is-ancestor` succeeds and the tag tree contains
`plugins/steel-browser/jev-runtime.ts` and `plugins/steel-browser/engines.ts`.

## D-001: Release version 0.2.0

Status: Accepted

### Evidence

The merged line adds a second execution engine and a new credential surface.
The previous release shipped feature work as a patch (`0.1.1`), and its
marketplace range is `^0.1.0`.

### Options

- Patch bump `0.1.2`, consistent with the previous release pattern.
- Minor bump `0.2.0`, marking the new engine surface.

### Chosen approach

`0.2.0`, chosen by the user. Existing `^0.1.0` installations stay on releases
that predate Jev until the catalog's range changes.

### Trade-offs and risks

Users on the old range need a catalog refresh plus an update to receive Jev.

### Verification

`plugins/steel-browser/package.json`, `package-lock.json`, and both README
install commands name `0.2.0` / `@^0.2.0`.
