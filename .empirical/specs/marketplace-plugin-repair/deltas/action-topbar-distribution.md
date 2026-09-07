# Action Topbar Distribution Delta

## ADDED Requirements

### Requirement: Launcher overlay stacking
Action Topbar's launcher SHALL render above ordinary BB page content and SHALL remain below host-owned modal, dialog, approval, and interaction layers.

#### Scenario: Open over a plugin marketplace page
- **GIVEN** a BB page with positioned or scrolling content
- **WHEN** the user opens Action Topbar's launcher
- **THEN** the complete launcher remains visible and interactive above the page
- **AND** no page card, header, or scroll container paints over it

#### Scenario: Host dialog opens
- **GIVEN** Action Topbar's launcher is visible
- **WHEN** BB opens a host-owned modal or dialog
- **THEN** the host surface remains visually and interactively above the launcher

#### Scenario: Preserve launcher interaction
- **WHEN** stacking is corrected
- **THEN** keyboard navigation, action activation, outside-click dismissal, viewport positioning, and supported drag behavior remain unchanged
