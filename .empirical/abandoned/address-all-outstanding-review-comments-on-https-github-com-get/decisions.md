# Decisions

## D-001: Publish a patch release

Status: Accepted

### Evidence

`dockside/v0.1.0` is immutable and points at a manifest with an
  empty `dependencies` object. The maintainer explicitly requested a new
  matching tag.

### Options

Move v0.1.0; publish v0.1.1; change the marketplace to an exact
  commit.

### Chosen approach

Publish `dockside/v0.1.1` from a new release commit.

### Trade-offs and risks

One new version/tag is required, while preserving provenance
  and the marketplace's semver update path.

### Verification

Verify both public peeled tag commits after approved publication.

## D-002: Declare source-runtime packages as dependencies

Status: Accepted

### Evidence

Source imports name Hugeicons, Radix Context Menu, Radix Select,
  `clsx`, `tailwind-merge`, and `zod`; the maintainer's managed-install check
  identifies the same set.

### Options

Bundle or externalize packages differently; install development
  dependencies in production; correct the manifest.

### Chosen approach

Put the six packages in `dependencies`. Keep type-only/tooling
  packages in `devDependencies`.

### Trade-offs and risks

Production installation includes the packages the runtime
  already uses, increasing install size only by required code.

### Verification

Use manifest guards and an isolated production-only dependency resolution.

## D-003: Keep the marketplace semver range

Status: Accepted

### Evidence

The existing `^0.1.0` range includes v0.1.1, while the source,
  subdirectory, and `dockside/` tag prefix are correct.

### Options

Change the range to `^0.1.1`; keep `^0.1.0`; switch to an exact
  tag.

### Chosen approach

Keep `^0.1.0` so existing compatible-release intent remains
  unchanged and the newest matching tag is selected.

### Trade-offs and risks

The entry diff is limited to the new category; the public tag
  must exist before remote source validation can pass.

### Verification

Run the marketplace source checker after the public tag exists.

## D-004: Categorize Dockside as thread management

Status: Accepted

### Evidence

The current marketplace category describes plugins that find,
  identify, organize, or archive threads, matching Dockside's project-first
  thread families, statuses, ordering, snoozing, and archival controls.

### Options

`thread-management`; `agents-and-providers`;
  `tasks-and-workflows`.

### Chosen approach

Use `thread-management`.

### Trade-offs and risks

The primary user value determines discovery placement even
  though Dockside also displays child agents.

### Verification

Run the marketplace build and confirm the category exists in the base manifest.

## D-005: Gate all remote mutations on explicit release approval

Status: Accepted

### Evidence

The submit-a-plugin workflow requires exact account, repository,
  commit, package, version, source, and commands before the first push or tag.

### Options

Push during preparation; stop before any remote mutation.

### Chosen approach

Prepare, test, and commit locally; request approval immediately
  before executing remote-changing commands.

### Trade-offs and risks

Delivery requires one explicit human confirmation after local preparation.

### Verification

Compare the approved commit and tag to public refs, run the
  marketplace checks, and inspect PR checks/review state after delivery.
