## Purpose

Add an opt-in DeepSeek balance provider to Usage Tracker without changing how
BB-reported agent usage providers are summarized.

## ADDED Requirements

### Requirement: DeepSeek balance provider

Usage Tracker must expose DeepSeek as an independently configurable provider
that reads the account balance from the DeepSeek API with a server-held key.

#### Scenario: Balance without a budget

Given DeepSeek is enabled and the API returns a positive balance, when no
topped-up amount is configured, then the sidebar shows the balance amount and no
percentage bar.

#### Scenario: Balance against a topped-up amount

Given DeepSeek is enabled and the user configured a topped-up amount, when the
API reports a lower balance, then the provider shows the share used and reaches
100% at a zero balance.

#### Scenario: Missing or rejected key

Given DeepSeek is enabled without a key or with a rejected key, when the sidebar
loads, then the provider shows an unauthenticated state and a recovery message
while the other providers continue to load.

#### Scenario: Agent summary

Given DeepSeek and an agent provider are enabled, when the strip summarizes
usage across providers in use, then only the agent provider contributes to the
cumulative percentage.

### Requirement: Provider metadata and docs

The DeepSeek provider must have its own preference key, brand mark, colour,
tests, and documentation consistent with the existing provider pattern.

#### Scenario: Enabling DeepSeek

Given Usage Tracker settings, when DeepSeek is enabled, then only DeepSeek's
preference changes and the strip renders its mark and balance reading alongside
the other enabled providers.
