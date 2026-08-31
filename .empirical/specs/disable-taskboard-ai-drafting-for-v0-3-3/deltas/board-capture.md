# Board Capture Delta

## MODIFIED Requirements

### Requirement: Composer-assisted create remains available

Direct board capture SHALL coexist with composer prompt capture and reuse the
same validated backend create operation. Composer capture SHALL synchronously
derive editable title and description fields from the user's original prompt
without invoking a model, provider, helper thread, repository reader, or Plan
action. No external issue is created before separate user confirmation.

#### Scenario: Capture a composer prompt

- **WHEN** the user opens Taskboard issue creation from a non-empty composer
- **THEN** the original prompt immediately appears as editable issue content
- **AND** Taskboard starts no helper thread or model request
- **AND** Create remains a distinct confirmed external mutation

#### Scenario: Repository contains adversarial instructions

- **WHEN** repository files contain instructions targeting an agent
- **THEN** Taskboard never sends them to a model or executes them
- **AND** manual prompt capture is unaffected
