Bring external issues into BB with a project-scoped list or Kanban board. Each BB project selects GitHub, GitLab, Gitea, Linear or Jira.

## What you get

- Browse cached summaries and open live descriptions, assignees, labels and comments.
- Move issues through provider statuses and review a new issue before creating it.
- Keep the board beside a conversation, attach issues as context and use the Taskboard CLI.

## Gitea

Self-hosted Gitea repositories use an existing tea login and an explicit host/owner/repository. Taskboard supports paginated issues, live comments, creation, labels, assignees, milestones and due dates. Native Open/Closed and existing status/* labels provide workflow stages. Status moves preserve unrelated labels and close or reopen the issue as appropriate.

## Requirements

Configure the selected provider for each project. Gitea requires tea 0.16 or newer on the BB server machine and a login with repository access. Authentication remains in tea. GitHub uses BB's GitHub integration; GitLab requires glab; Linear and Jira Cloud require their provider configuration. Gitea creation supports text, and status changes can be partial because label and state updates use separate requests.
