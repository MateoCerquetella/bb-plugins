# Steel Browser viewer capability delta

## ADDED Requirements

### Requirement: Bounded panel hover work

The automatic hover sampler SHALL run only while automatic hover expansion or
collapse is possible.

#### Scenario: User pins the expanded panel

- **WHEN** the user explicitly expands BB Surf
- **THEN** the panel remains expanded until explicit shrink or Escape
- **AND** the automatic hover sampling interval is not active

#### Scenario: User returns to compact mode

- **WHEN** the user shrinks the pinned panel
- **THEN** the compact panel resumes the existing hover sampling behavior
