# Taskboard GitHub CLI Delta

## Purpose

Limit Taskboard's GitHub CLI subprocess trust boundary without breaking the
supported token, persisted-config, enterprise, keyring, proxy, TLS, or platform
lookup paths that `gh api` needs.

## ADDED Requirements

### Requirement: Deliberate GitHub CLI process environment

Taskboard SHALL launch GitHub CLI subprocesses with an explicit environment
allowlist rather than the complete plugin-server environment. The allowlist
SHALL preserve supported GitHub authentication/configuration, platform config
and keyring roots, proxy/TLS configuration, conditional executable search, and
required Windows runtime lookup. Taskboard SHALL set deterministic locale and
noninteractive/no-update/no-telemetry policy and exclude unrelated application
variables, secrets, and process-injection settings.

#### Scenario: Authenticate through supported GitHub CLI state

- **WHEN** Taskboard invokes `gh` using a supported token, persisted/keychain
  account, enterprise host, proxy, or custom CA
- **THEN** only the required named environment reaches `gh`
- **AND** the command remains noninteractive with deterministic locale

#### Scenario: Server environment contains unrelated secrets

- **GIVEN** the Taskboard server contains BB, provider, cloud, tracker, Node, or
  dynamic-loader variables outside the allowlist
- **WHEN** Taskboard invokes `gh`
- **THEN** those variables are absent from the child environment
