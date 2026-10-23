# Action Topbar Taskboard Icon

## Purpose

Keep Taskboard visually recognizable wherever Action Topbar represents it.

## ADDED Requirements

### Requirement: Taskboard uses its product icon in Action Topbar

Action Topbar MUST render Taskboard actions and fallback Taskboard tabs with the
target/dart glyph used by Taskboard's sidebar and panel actions.

#### Scenario: Taskboard appears in the action launcher

- **WHEN** the user opens Action Topbar's action launcher
- **THEN** the Taskboard action displays the target/dart glyph

#### Scenario: Taskboard has no native tab icon to clone

- **WHEN** Action Topbar renders a Taskboard tab without a native icon
- **THEN** its fallback icon displays the same target/dart glyph
