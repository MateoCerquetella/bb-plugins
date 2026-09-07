# Repository Knowledge Index

Curated repository knowledge for the `bb-plugins` multi-plugin workspace.

The root owns orchestration and one lockfile; Action Topbar, Dockside, Save My
Model, Host Monitor, Taskboard, Touch Bar, Usage Tracker, and Clean My Context remain independent
plugin packages under `plugins/`. `.bb/plugins.json` is the installable
collection index; each leaf manifest remains authoritative for that plugin.

## Topics

- [Overview](overview.md)
- [Architecture](architecture.md)
- [Commands](commands.md)
- [Conventions](conventions.md)
- [Design language](design-language.md)

Source dependencies, page digests, and freshness are recorded in
[manifest.json](manifest.json). This is a compact file-backed context set, not
an embedding or vector database.
