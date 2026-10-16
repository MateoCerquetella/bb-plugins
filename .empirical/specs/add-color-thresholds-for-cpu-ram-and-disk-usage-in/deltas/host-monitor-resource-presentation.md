# Host Monitor Resource Presentation

## Purpose

Make resource pressure immediately scannable without sacrificing freshness or
accessibility semantics, and keep body-mounted Host Monitor UI correctly styled
inside the current BB shell.

## ADDED Requirements

### Requirement: Resource threshold tones

Host Monitor MUST derive a visible and accessible tone for every fresh CPU,
RAM, and disk percentage from the effective ordered attention and critical
thresholds. Values below attention MUST be normal, values at or above attention
MUST warn, and values at or above critical MUST be critical.

#### Scenario: Fresh readings cross both thresholds

- **Given** attention is 85% and critical is 95%
- **When** fresh readings are 72%, 88%, and 97%
- **Then** their tones are normal, attention, and critical respectively
- **And** assistive text identifies the threshold state

#### Scenario: A reading is not current

- **Given** a percentage is stale or unavailable
- **When** Host Monitor presents it
- **Then** a stale percentage is neutral
- **And** an unavailable percentage is identified as unavailable

### Requirement: Body-mounted Host Monitor surfaces

Imperative Host Monitor surfaces mounted under `document.body` MUST carry the
current BB plugin scope attributes so the compiled Host Monitor stylesheet
applies to both the visible monitor and its drag preview.

#### Scenario: The floating monitor opens in current BB

- **Given** BB scopes plugin CSS to marked plugin roots
- **When** the user opens or drags out the floating Host Monitor
- **Then** the surface and drag preview carry the Host Monitor plugin scope
- **And** the monitor is fixed-positioned and bounded inside the visual viewport
- **And** its threshold tone styles remain visible
