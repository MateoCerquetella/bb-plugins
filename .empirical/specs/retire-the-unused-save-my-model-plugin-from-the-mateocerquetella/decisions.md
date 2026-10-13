# Decisions: Retire The Unused Save My Model Plugin From The Mateocerquetella

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

- The user approved retiring the package, catalog entry, lockfile workspace references, and staged marketplace metadata.
- `plugins/save-my-model/` is a workspace matched by `plugins/*` and is listed in `.bb/plugins.json`.
- `docs/marketplace-save-my-model.json` stages the plugin for repository marketplace distribution.
- The root README removal is already on `main` at `960fe62a`.
- Historical tags `save-my-model/v0.1.0` through `save-my-model/v0.1.3` exist.

### Options

- Remove only the README/catalog promotion and leave the package installable.
- Retire active package source and distribution metadata while preserving published Git tags.

### Chosen approach

Retire the plugin source, catalog entry, lockfile records, and staged marketplace metadata. Preserve all historical Git tags and unrelated Empirical records.

### Trade-offs and risks

The package can no longer be installed from the current repository after retirement. Historical tags remain resolvable. Lockfile regeneration can affect unrelated dependency records, so the diff will be reviewed and constrained to the removed workspace and now-unused dependencies.

### Verification

Compare catalog entries with plugin directories, search for stale active references, run a clean workspace install and root checks, and confirm historical tags still resolve to their existing commits.
