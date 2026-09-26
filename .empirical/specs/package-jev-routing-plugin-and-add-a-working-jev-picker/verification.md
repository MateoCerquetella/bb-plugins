# Verification

- Plugin typecheck, three server tests and authoritative BB build passed on SDK 0.4.21.
- Fifteen inherited Python routing tests passed.
- Live Playwright verified Jev Routing in the native picker, per-thread badge, history bounded to eight rows, Close dismissal, Escape dismissal and no injected stacked history. Screenshots were inspected locally.
- Independent Dyaus services are active. An ephemeral Codex turn and a hidden BB test thread both returned OK. The BB plugin reported jev/auto as requested and gpt-5.6-luna / low / gate=apply / status=200 as the actual route. The test thread was archived.
- Full root npm run check was executed with Node 22.22.0. It failed on Taskboard's existing assertion "keeps Usage Tracker private and documents its Git release too". Neither Taskboard nor Usage Tracker source was changed. Earlier native-binding setup failures were resolved with npm rebuild better-sqlite3.
- Formal workflow reports implemented; its broader context and review gates remain pending. These are executed checks, not a claim that every repository workflow gate passed.

Rollback: uninstall jev-route; disable the jev-router user service; remove only the jev/auto custom model registrations. Codex Router configuration should be reverted using its disable command if the operator no longer wants the routing transport. No unrelated plugin source is part of this change.
