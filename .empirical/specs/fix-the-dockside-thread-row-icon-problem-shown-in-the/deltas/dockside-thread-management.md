# Dockside Thread Management Delta

## MODIFIED Requirements

### Requirement: Root family cards have exactly two semantic rows

Every root MUST render exactly two compact fixed rows. Row one MUST contain the
family state/activity icon, truncated title, and far-right elapsed time. Row two
MUST contain truncated branch text and one shrink-resistant right cluster with
the readable state badge, root-only PR metadata, and child disclosure/count.
Outside selection mode, a grouped root's leading column MUST reserve exactly
one fixed project badge. Provider identity MUST appear exactly once in the
trailing metadata immediately before family status and MUST NOT overlap the
project badge or adjacent content. Selection mode MUST replace the leading
project slot with its checkbox. Children MUST never render PR metadata.
Ambiguous icons MUST offer hover and keyboard-focus help.

#### Scenario: Provider identity stays inside the root icon slot

- **Given** a project has a colored initial badge and a root thread has a known
  provider logo
- **When** Dockside renders the project header and root row at either supported
  density
- **Then** the project initial appears unobstructed in the root's leading badge
- **And** the root row shows one provider glyph beside its trailing status
- **And** neither graphic overlaps the title or each other

#### Scenario: Selection replaces provider identity

- **Given** a root thread shows its project badge and trailing provider glyph
- **When** the user enters selection mode
- **Then** the leading project slot contains the selection checkbox instead
- **And** the root retains its two-row geometry
