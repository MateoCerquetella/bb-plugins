# Taskboard GitHub CLI Delta

## Purpose

Limit Taskboard's GitHub CLI subprocess trust boundary without breaking
supported token, persisted-config, enterprise, keyring, proxy, TLS, or Windows
runtime behavior.

## ADDED Requirements

### Requirement: Fixed executable and deliberate child environment

Taskboard SHALL resolve GitHub CLI only from fixed absolute, non-project
locations whose candidates are regular executable files. It SHALL ignore
`PATH` and `PATHEXT` for discovery and SHALL pass an exact child environment
allowlist containing only supported GitHub authentication/configuration,
platform config and keyring roots, proxy/TLS configuration, Windows runtime
lookup when applicable, and fixed locale/noninteractive policy. Unrelated
application variables, secrets, runtime hooks, debug, editor, and pager state
SHALL be absent.

#### Scenario: Authenticate through supported GitHub CLI state

- **WHEN** Taskboard invokes `gh` using a supported token, persisted account,
  enterprise host, proxy, keyring, or custom CA
- **THEN** a verified fixed executable receives only the named environment
- **AND** the command remains noninteractive with deterministic locale

#### Scenario: Project or server attempts executable injection

- **GIVEN** project directories or `PATH` contain a different `gh` executable
- **WHEN** Taskboard resolves GitHub CLI
- **THEN** those candidates are ignored
- **AND** unrelated server secrets and process-injection variables are absent
  from the child
