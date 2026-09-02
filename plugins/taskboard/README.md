<p align="center">
  <img src="./assets/icon.svg" width="72" height="72" alt="Taskboard ticket icon" />
</p>

<h1 align="center">Taskboard</h1>

<p align="center">
  GitHub, Linear, or Jira tasks inside BB—one focused tracker for every project.
</p>

<p align="center">
  <a href="https://github.com/MateoCerquetella/bb-plugins/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/MateoCerquetella/bb-plugins/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/BB-%E2%89%A5%200.38-7c3aed?style=flat-square" alt="BB 0.38 or newer" />
  <img src="https://img.shields.io/badge/GitHub%20%C2%B7%20Linear%20%C2%B7%20Jira-supported-2563eb?style=flat-square" alt="GitHub, Linear, and Jira supported" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

![Taskboard inside BB](https://raw.githubusercontent.com/MateoCerquetella/bb-plugins/main/docs/media/hero.png)

Taskboard brings external issues into the place where the work happens. Pick
exactly one tracker for each BB project, browse a quiet List or Kanban view,
open live task details, move work through real provider statuses, and hand a
task to an agent without rebuilding context by hand.

## What it does

- **Project-first tasks** — each BB project selects GitHub, Linear, or Jira;
  different projects can use different providers.
- **List and Kanban** — compact rows plus Linear-style Status, State group,
  Assignee, Priority, Project, and Labels filters. Filter values within one
  field match either value; different fields combine to narrow the view.
- **Remembered project views** — each BB project remembers selected filters,
  List or Kanban view, and collapsed finished groups on this device. The full
  board and pinned right panel share one project view; Across projects remains
  independent.
- **Project board preferences** — Manage controls which filters are visible,
  the default List or Kanban layout, and the exact provider status order.
  Provider-native workflow groups, drag-and-drop, and keyboard status moves
  remain available without repetitive provider chips on every task.
- **Filter presets** — save the complete current project view, including its
  search, filters, List or Kanban mode, and collapsed groups, then explicitly
  reapply it from the **Presets** menu. Rename, reorder, and delete presets in
  **Manage → Board preferences**. Presets stay scoped to one project, are not
  available in Across projects, and never apply automatically.
- **Live task details** — cached summaries keep browsing fast; opening a task
  fetches its current description, labels, assignee, and comments.
- **Pinned beside every chat** — open Taskboard from the thread-header button,
  then keep it pinned in BB's right panel while moving between threads.
- **Status changes everywhere** — use the shaped status glyph on a List row or the
  status pill inside a task to move it through the provider's real workflow.
- **Create without context switching** — turn a composer prompt into a
  provider-aware issue beside BB's native prompt actions in New thread or an
  existing thread, or choose **New issue** directly from a project board. Native
  assignee, status, priority, labels, due date, milestone, and issue type fields
  appear when supported. Taskboard remembers the last successfully used
  assignee for that exact project and destination. Assisted creations attach a
  Taskboard mention so the thread continues with live issue context.
- **Agent handoff** — prefill a BB prompt from any task or attach one with the
  Taskboard mention result.
- **CLI automation** — browse cached/live work, inspect transitions, move
  statuses, refresh providers, and manage project connections through
  `bb taskboard`. Issue creation remains an intentional review-and-confirm UI
  action in the board or composer.

[Andrii Los (@RIP21)](https://github.com/RIP21) contributed Taskboard's
project-view persistence work and dogfooding fixes, plus named filter presets.

## Install

Taskboard is a full-trust BB plugin. Review the source, then install its tracking
Git release directly from this monorepo:

```sh
bb plugin install git:https://github.com/MateoCerquetella/bb-plugins.git@^0.3.0 --subdirectory plugins/taskboard --tag-prefix taskboard/
```

After [the BB Community entry](https://github.com/get-bb/marketplace/pull/129)
is merged and live, the equivalent shorthand is:

```sh
bb plugin install taskboard
```

Open **Taskboard → Manage**, choose a BB project, select its tracker, and save
the connection. The same page configures that project's filters, default
layout, and workflow ordering. Each project selects exactly one tracker; other
projects can choose a different provider and board setup.

Update, reload, or remove the managed Git installation later:

```sh
bb plugin outdated
bb plugin update taskboard
bb plugin reload taskboard
bb plugin remove taskboard
```

## Connect a tracker

### GitHub

Taskboard reuses BB's official GitHub plugin and the repositories already
mapped to the BB project. There is no second GitHub token or repository picker.

```sh
bb plugin install github
gh auth login
bb plugin reload github
```

### Linear

Choose Linear in **Manage**, then provide the project's Linear personal API key
and required team key. Taskboard loads that team's queue rather than a broad
user-wide assigned-issues feed.

### Jira

Choose Jira, then provide the project's Atlassian Cloud URL, account email, API
token, and JQL. Only HTTPS `*.atlassian.net` origins are accepted.

![Taskboard across projects](https://raw.githubusercontent.com/MateoCerquetella/bb-plugins/main/docs/media/across-projects.png)

## Work with tasks

The panel opens on BB's current project. Use **Across projects** only when you
want an explicit grouped overview. List and Kanban preserve each provider's
actual workflow names. The primary delivery stages appear in the focused order
Backlog, Todo, In Progress, In Review, QA, then the remaining workflow stages
by default; provider-specific stages remain between the closest matching
stages. Change that ordering per project in **Manage → Board preferences**.
Rejected writes roll back the optimistic move.

List view uses compact shaped state glyphs and collapses finished or canceled
groups by default. Searching temporarily opens matching groups without changing
their saved state. On constrained right panels, search stays visible while one
compact **Filters** control holds the enabled project facets.

From a thread, click the Taskboard panel button in the upper-right header. The
panel opens beside the conversation; leave its pin enabled to reopen it
automatically when you switch chats. Use the pin control in the panel header to
stop reopening it. The right panel follows the BB project selected for each
thread, while **Open full Taskboard** keeps the larger workspace available when
you need filters or board management.

On BB's root **New thread** screen, open the right panel (`Ctrl+J`), choose
**New tab → Actions → Taskboard**, and select a project in the composer. The
panel follows that project without creating a thread.

With Taskboard beside an existing thread or **New thread**, drag a ticket from
the constrained List or Kanban board onto the prompt editor to add its live
Taskboard mention. The existing draft and attachments stay in place and BB
does not submit automatically. For a keyboard-accessible equivalent, open the
ticket and choose **Add to chat**. Kanban drops onto status lanes continue to
move the provider ticket; drops onto the composer copy its reference only.

In List view, click the shaped status glyph on a task row to choose another
provider status. The same control appears as a labeled status pill at the top
of task details. Changes update optimistically and roll back if GitHub, Linear,
or Jira rejects the transition.

In **New thread** or an existing thread, write a prompt and click the Taskboard
ticket icon beside the prompt and voice actions. Taskboard automatically uses
the tracker selected for that BB project. GitHub offers its mapped
repositories, Linear uses the configured team, and Jira infers project keys
from simple `project = KEY` or `project in (...)` JQL scopes (with a project-key
field when the scope cannot be inferred).

The icon opens a review modal immediately while a hidden, read-only helper uses
the BB project's repository context to turn the rough prompt into a natural
title and a standalone description with requested changes and acceptance
criteria. Provider metadata can load for the review form, but no issue is
created or mutated until you click **Create issue**. If the helper cannot produce a draft, the original
prompt remains editable as a visible fallback. You can also choose **Use
original prompt** immediately instead of waiting, then retry the
repository-aware draft from the same modal.

From a project board, choose **New issue** to open the same validated provider
form with a blank editable title and description. Direct capture skips the
repository drafting helper. It loads provider metadata for review but never
creates or mutates an issue until you confirm creation.

![Live task detail](https://raw.githubusercontent.com/MateoCerquetella/bb-plugins/main/docs/media/task-detail.png)

The CLI covers browsing, detail, transitions, status moves, refresh, and project
configuration. Direct/composer-assisted issue creation stays in BB's review UI.
The CLI uses the current BB project unless `--project <proj_id>` is supplied:

```text
bb taskboard status [--project <proj_id>] [--json]
bb taskboard config [--project <proj_id>] [--source linear|github|jira] [provider fields] [--json]
bb taskboard credentials [--project <proj_id>] [--json]
bb taskboard refresh [linear|github|jira] [--project <proj_id>] [--json]
bb taskboard list [--project <proj_id>] [--source linear|github|jira] [--query <text>] [--preset <name>] [--cached] [--json]
bb taskboard show <linear|github|jira> <locator> [--project <proj_id>] [--json]
bb taskboard transitions <linear|github|jira> <locator> [--project <proj_id>] [--json]
bb taskboard move <linear|github|jira> <locator> --status <id> [--project <proj_id>] [--json]
bb taskboard presets list [--project <proj_id>] [--json]
bb taskboard presets save <name> --from-state <json> [--project <proj_id>] [--json]
bb taskboard presets rename <name> <new-name> [--project <proj_id>] [--json]
bb taskboard presets delete <name> [--project <proj_id>] [--json]
```

`presets save --from-state` accepts a complete versioned project-view JSON
object. `list --preset` resolves the preset name case-insensitively and applies
all of its facets through the same filtering rules as the board; explicit
`--source` and `--query` flags take precedence over the preset values.

An explicit source must match the tracker selected for that project. Taskboard
rejects mismatches before contacting a provider.

## Credentials and privacy

Linear and Jira credentials are isolated by BB project. Secret inputs are
write-only and stay blank after loading or saving. Taskboard stores the live
copy in owner-only files, never returns secret values to the frontend or CLI,
and accepts credentials only through BB's authenticated interaction form.

The external tracker remains authoritative. Taskboard caches task summaries
and sync metadata in its plugin database; details and comments are fetched live
when needed.

Issue text attached to an agent is explicitly delimited as untrusted external
tracker data. It remains useful context, but it is never presented as repository
policy or agent instructions.

## Development

```sh
git clone https://github.com/MateoCerquetella/bb-plugins.git
cd bb-plugins
npm install
npm run check
bb plugin install ./plugins/taskboard
npm run dev --workspace bb-plugin-taskboard
```

`components/ui/` is vendored BB component source pinned by `components.json`.
Add another component with `npx shadcn add @bb/<component>`. The exact
`@get-bb/plugin-sdk` development dependency makes the source typecheck without
a BB checkout. Run `npm run types:refresh` and then `npm install` when updating
the minimum BB version. The script deliberately uses this workspace's pinned
BB toolchain even when run from inside a live BB agent environment.

## License

[MIT](./LICENSE) © 2026 Mateo Cerquetella.
