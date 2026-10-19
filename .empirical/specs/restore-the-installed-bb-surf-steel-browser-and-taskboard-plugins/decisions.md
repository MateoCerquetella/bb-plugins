# Decisions: Restore The Installed Bb Surf Steel Browser And Taskboard Plugins

Record concise, externally reviewable evidence and choices here. Do not store
private chain-of-thought, prompts, credentials, secrets, or scratchpad text.

## D-001: Select the implementation approach

Status: Accepted

### Evidence

Both IDs were registered against missing directories. BB remove explicitly
deletes settings, secrets, and schedules. Its help directs local relocation
through installation of the new path.

### Options

Uninstall and install marketplace releases, or relocate existing registrations
to a standalone clone. The first option risks data loss and downgrades
Taskboard from its installed main-branch 0.3.5 code.

### Chosen approach

Relocate both IDs in place. Use published Git ranges for new users.

### Trade-offs and risks

The clone is not managed by thread-worktree cleanup, but remains removable by
an operator. Local installations do not automatically track marketplace
updates. Do not promise protection against all deletion or disk loss.

### Verification

Both install operations returned running with compatible frontend bundles.
Reload and status checks confirm Surf connectivity and Taskboard's retained
project connection. Record the disabled GitHub dependency as a remaining limit.

## D-002: Make Taskboard's GitHub source native

Status: Accepted

### Evidence

Taskboard's GitHub adapter already executes `gh` for issue metadata and
creation. It uses the separate GitHub plugin only for status, cached lists,
details, refresh, and state changes. Taskboard already owns a provider cache,
refresh scheduler, failure state, and project-remote parser. Live refresh
failed first on the GitHub plugin's new `ghState` field and then became
unavailable when the user removed that plugin.

### Options

Keep the separate plugin and relax the RPC response schema, copy its cache and
background service into Taskboard, or complete Taskboard's existing direct
`gh` adapter.

### Chosen approach

Complete the direct `gh` adapter. Discover the repository from the selected BB
project, validate GitHub responses at the adapter boundary, and persist results
through Taskboard's existing store.

### Trade-offs and risks

Taskboard depends on the host's `gh` installation and authentication, as it
already does for creation. A project without a GitHub remote has no implicit
repository. Taskboard intentionally does not inherit unrelated GitHub-plugin
features such as pull-request review, extra account-wide repositories, and
thread links.

### Verification

Run adapter behavior tests with controlled CLI responses. Then keep the GitHub
plugin removed, reload Taskboard, refresh the existing project, and confirm its
saved GitHub source returns live items without clearing its prior cache.
