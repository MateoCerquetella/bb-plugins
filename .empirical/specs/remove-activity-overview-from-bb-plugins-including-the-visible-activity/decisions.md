# Decisions: Remove Activity Overview

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

`app.tsx` registers the dashboard in three BB slots. `server.ts` is empty,
`data.ts` contains only deterministic sample data, and the package has no
persisted state or external integration. The current BB host reports
`activity-overview@0.1.0` as installed and running.

### Options

1. Delete the complete package and its current distribution references.
2. Remove only selected app registrations.
3. Keep the package with no registrations.
4. Add replacement centering CSS or change BB core.

### Chosen approach

Delete the complete package, current catalog entry, root README entry, and
workspace lockfile records. Remove the current host installation for live UI
verification. Add no layout code because BB core already owns the centered
thread column.

### Trade-offs and risks

Existing installations on other hosts remain until their owners remove them.
The repository does not control the exact BB core layout. A stale installed
record or cached browser bundle can make the retired UI appear present, so
verification must inspect both the plugin registry and the live interface.
Historical Empirical records remain because they are audit evidence, not
current product or distribution paths.

### Verification

Review the scoped diff, run the root check, confirm that the installed id is
absent, and capture the live BB thread without Activity Overview.
