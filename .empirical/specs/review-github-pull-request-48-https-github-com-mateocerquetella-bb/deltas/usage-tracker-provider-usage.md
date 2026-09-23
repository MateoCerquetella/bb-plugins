# Usage Tracker Provider Usage Delta

## ADDED Requirements

### Requirement: Explicit local Claude Keychain usage override

Usage Tracker SHALL optionally read Claude Code OAuth credentials from a
user-selected macOS Keychain generic-password service when BB cannot derive the
service created for `CLAUDE_CONFIG_DIR`. The setting SHALL be disabled by
default. Accepted services SHALL be exactly `Claude Code-credentials` or
`Claude Code-credentials-` followed by eight lowercase hexadecimal characters.
The credential SHALL be sent only to the fixed Anthropic OAuth usage endpoint,
SHALL NOT be persisted by the plugin, and SHALL NOT appear in RPC output or
errors.

#### Scenario: Empty setting preserves BB usage

- **GIVEN** Claude Keychain service is empty
- **WHEN** Usage Tracker loads a snapshot
- **THEN** it uses BB's Claude Code provider response unchanged
- **AND** it performs no direct Keychain lookup or Anthropic request

#### Scenario: Suffixed service loads local usage

- **GIVEN** the primary BB machine is macOS
- **AND** the setting is `Claude Code-credentials-80ae27a8`
- **WHEN** the matching Keychain item contains valid unexpired Claude OAuth
  credentials
- **THEN** Usage Tracker requests the fixed Anthropic usage endpoint
- **AND** replaces only the primary machine's Claude Code provider entry
- **AND** exposes normalized usage windows without the access token

#### Scenario: Unrelated service is rejected before lookup

- **GIVEN** the setting does not match an accepted Claude Code service
- **WHEN** Usage Tracker loads Claude usage
- **THEN** it returns a bounded configuration error
- **AND** no Keychain item is read
- **AND** no network request is made

#### Scenario: Remote thread preserves remote usage

- **GIVEN** the active thread resolves to a non-primary BB host
- **AND** a server-local Claude Keychain service is configured
- **WHEN** Usage Tracker loads the thread's usage
- **THEN** it retains the remote host's BB Claude Code response
- **AND** does not substitute credentials from the server machine

#### Scenario: Provider failure is safe and isolated

- **WHEN** credentials are missing, malformed, expired, throttled, the usage
  response is malformed, or the request fails
- **THEN** the Claude Code entry reports the corresponding bounded status
- **AND** the message contains no raw exception, command output, or credential
- **AND** other provider results remain available
