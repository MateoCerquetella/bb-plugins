# Taskboard Local Install Compatibility

## Request

> Install Taskboard with its optional Symphony execution backend into live BB on this Mac. Preserve installed v0.3.4 GitHub status compatibility and hardened gh resolution by restoring the already-released adapter fixes on the execution branch. Keep tracker configuration, credentials and cached work during the supported plugin source switch. Install from a stable local checkout. Verify the loaded plugin and, for full setup, the pinned native Symphony service using the existing Codex login. No new UI, task planning policy, external message, paid coding task, or publication.

## Goal

The user can use the already-approved Taskboard execution integration in the live BB instance, with existing tracker state retained.

## Acceptance Criteria

- [ ] [AC-1] The released v0.3.4 GitHub status-schema and hardened CLI-resolution behavior remain covered by their released regression tests alongside the existing execution tests.
- [ ] [AC-2] The installed plugin runs from a stable local source and retains project configurations, secrets, and cached work across the supported source replacement, with a private rollback backup.
- [ ] [AC-3] Full setup uses the pinned native Symphony adapter and existing Codex login, exposes healthy status, and configures Taskboard consistently. Plugin-only selection leaves managed execution disabled. No real task is dispatched by installation.

## Scope

Restore the released GitHub adapter/helper and associated tests, install and verify the plugin, and prepare the optional native service. Reuse the accepted execution UI without changing it.

## Non-goals

No new plugin, UI redesign, policy changes, external issue mutation, paid agent run, publication, or BB core edits.

## Verification

Run focused Taskboard regression checks. Verify live plugin source/status and safe retention of saved state. For full setup verify the native runtime's version/configuration/status with an empty queue. Never expose token values in logs or reports.

## Capability Deltas

See deltas/taskboard-install-compatibility.md.
