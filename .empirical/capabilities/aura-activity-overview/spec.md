# Aura Activity Overview Specification

## Purpose

Let BB users see their authenticated GitHub contribution history and follow-up
activity below the native New Thread composer through an optional AURA setting,
with accurate source states and compact presentation on desktop and mobile.

## Requirements

### Requirement: Optional activity within AURA
AURA SHALL own a persisted, default-off activity overview preference and render
its compact overview below the horizontally centered native New Thread composer
when enabled. The rendered page SHALL expose exactly one visible Activity
overview heading supplied by the host homepage slot.

#### Scenario: Enabling activity
- GIVEN an existing AURA wallpaper, saved slots, and native draft
- WHEN the user enables the overview in Settings -> Aura
- THEN the overview appears below the centered native composer with one visible
  Activity overview heading
- AND the wallpaper, slots, and draft remain unchanged.

#### Scenario: Disabling activity
- WHEN the user disables the overview and reloads
- THEN the overview is absent
- AND the native composer remains horizontally centered.

### Requirement: Authenticated, scoped activity
The overview SHALL display only actual authenticated GitHub counts and dated
contribution cells. Period and repository controls SHALL apply to supported
source data; incomplete or unavailable metrics SHALL be labeled explicitly.

#### Scenario: Source is unavailable
- GIVEN GitHub authentication is missing or an API request fails
- WHEN the overview loads
- THEN it displays an unavailable/error state and retry rather than zero counts
  or generated cells.

#### Scenario: Valid empty period
- GIVEN GitHub returns a complete, valid period with no activity
- THEN metrics show zero, patterns indicate no activity, and the period is
  distinguished from an unavailable response.

### Requirement: Responsive native presentation
The overview SHALL inherit BB theme tokens, use compact rule-separated metrics
and patterns, keep horizontal scrolling inside the heatmap, and preserve the
native composer and project/provider interactions. The native composer SHALL
remain horizontally centered at every supported viewport size without cloning
or reparenting host controls.

#### Scenario: Narrow viewport
- GIVEN a 390px-wide viewport
- THEN the native composer is horizontally centered
- AND pattern rows stack below contributions
- AND controls remain reachable
- AND the document has no horizontal overflow.

#### Scenario: Long draft or short viewport
- WHEN the native draft grows or viewport height is reduced
- THEN the composer and overview remain reachable by vertical scrolling.

#### Scenario: Overview disabled
- GIVEN the activity overview is disabled
- WHEN the New Thread page loads
- THEN the native composer remains horizontally centered independently of the
  overview content.
