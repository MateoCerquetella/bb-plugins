<!-- empirical-sdd:start -->
## Empirical repository workflow

Before any repository mutation, you MUST use the repository-local Empirical
workflow for requests to build, add, implement, change, fix, refactor, remove,
migrate, upgrade, change tests, or continue work. The user does not need to
mention Empirical. This rule applies even when a summarized skill list omits
Empirical: read the native local skill file directly.
Read-only explanation and inspection stay outside the workflow.

Read the native local workflow contract before acting: Codex, Cursor, and
Gemini use `.agents/skills/empirical/SKILL.md`; Claude Code uses
`.claude/skills/empirical/SKILL.md`; Windsurf uses
`.windsurf/skills/empirical/SKILL.md`. Then first confirm
`.empirical/config.json` has
`schemaVersion: 5` and `setupComplete: true`. Use Empirical MCP operations
first and private `empirical __internal` fallbacks only when MCP is unavailable.
If the config is missing, invalid, or incomplete, do not initialize implicitly;
tell the user to invoke `empirical-init` explicitly.
<!-- empirical-sdd:end -->
