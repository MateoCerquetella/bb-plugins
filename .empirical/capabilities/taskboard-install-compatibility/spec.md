# Taskboard Install Compatibility Specification

## Purpose

Install the optional execution backend without regressing the user's existing GitHub adapter or losing tracker configuration.

## Requirements

### Requirement: Retain released GitHub compatibility

Taskboard SHALL retain the installed v0.3.4 optional ghState response support and hardened GitHub CLI environment and path resolution when enabling Symphony execution.

#### Scenario: The GitHub provider returns its current status

- WHEN status includes ghState or uses the supported authenticated CLI environment
- THEN Taskboard accepts the response and resolves the CLI with the released safety checks.

### Requirement: Preserve installation state

Changing the plugin's install source SHALL retain project configuration, tracker credentials, and cached work. The local source SHALL live outside this thread's disposable worktree.

#### Scenario: Switch from a catalog release to local execution support

- WHEN the plugin source is replaced
- THEN an owner-only backup exists, saved credentials and database state remain available, and BB reports the local plugin running.
