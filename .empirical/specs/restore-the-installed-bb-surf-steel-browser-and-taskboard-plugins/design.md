# Design

Use BB's supported local-path relocation, not uninstall. A standalone clone
under `~/.bb/plugin-sources/durable-bb-plugins` contains source and installed
dependencies. Its origin is the public GitHub repository, not the disposable
worktree. BB retains the plugin IDs and their stored data.

The runtime recovery uses current main so Taskboard stays at 0.3.5. Public
installation instructions use the available release ranges, Steel Browser
^0.1.0 and Taskboard ^0.3.4. This does not publish new tags or claim released
code includes every main-branch feature.

Use one documentation PR because both failures share the same installation
boundary. Keep unrelated Empirical closure changes out of that PR.

Verification uses actual reload and status commands. Surf's service is
connected. Taskboard runs and retains its configured source, but its disabled
GitHub dependency blocks live refresh. Do not silently enable that dependency.

## Native GitHub ownership

### Current flow

Taskboard already owns its provider-neutral cache, scheduler, source status,
issue creation form, and project configuration. Its GitHub adapter uses `gh`
directly for metadata and creation, but delegates status, refresh, issue lists,
details, and state changes to BB's separate GitHub plugin. The separate plugin
maintains another cache and discovers the same BB project remote.

### Chosen structure

Keep repository discovery in Taskboard's server boundary. Resolve the selected
BB project's `gitRemoteUrl` to one `owner/repo` value and pass that scoped list
into the GitHub adapter.

Make `plugins/taskboard/sources/github.ts` a complete direct `gh` adapter:

- `probeGithubStatus` executes `gh auth status --hostname github.com --active`.
- `list` executes bounded, paginated GitHub API requests for the configured
  repository and converts only issues, never pull requests.
- `get` loads the exact issue and comments.
- `createMetadata`, `create`, and `updateStatus` use the same authenticated CLI
  boundary.
- Zod schemas parse every JSON response before it enters Taskboard.
- Repository-scope checks run before every detail or mutation operation.

Taskboard's existing `syncOne` function remains the only persistence boundary.
It replaces the cached source only after a complete native list succeeds and
stores an error without deleting prior items when discovery, authentication,
network access, or parsing fails.

### Data shape

The adapter receives a stable scoped input:

```ts
interface GithubAdapterOptions {
  enabled: boolean;
  repositories: readonly string[];
  runGithubCli?: (args: string[], timeoutMs?: number) => Promise<string>;
}
```

External GitHub JSON is parsed into the existing
`ExternalWorkItemDetail` shape at the adapter boundary. No new database column,
credential type, or persisted source identifier is introduced.

### Alternatives

Copying the built-in GitHub plugin's background service and SQLite cache into
Taskboard would preserve its exact internal behavior, but would duplicate
Taskboard's existing scheduler and cache. Keeping the cross-plugin RPC with a
looser `ghState` schema would fix only the current version mismatch and would
still require users to install GitHub. Direct `gh` ownership removes both
failure modes with fewer stateful components.

### UI and documentation

The Manage view keeps the existing GitHub repository chips. Its explanatory
copy changes from "official GitHub connection" to the authenticated `gh` CLI
and project Git remote. The README removes all GitHub plugin installation
commands.

### Verification

Behavioral tests inject a fake `runGithubCli` and cover repository scoping,
authentication errors, issue-only list parsing, detail comments, open/closed
mutations, malformed responses, and cache-preserving server behavior. Live
verification keeps the GitHub plugin absent, reloads Taskboard, refreshes
`proj_ykxahiys47`, and reads Taskboard status and items.
