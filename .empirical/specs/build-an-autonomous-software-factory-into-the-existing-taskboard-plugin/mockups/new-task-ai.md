# New task AI and draft improvement mockup

## New issue dialog

```text
New issue · Engineering · Linear

Title
[ Fix the project switch resetting saved filters              ]

Description
[ Rough notes copied from the composer ...                     ]
[ Improve: Concise | Detailed ]  [ Improve title & description ]

AI for this task                         Project default / Custom
[logo] Codex · GPT-6.1
AI provider   [logo] Codex
Model         GPT-6.1
Reasoning     High
Permissions   Auto
Service tier  Default
[Use project defaults]

[ Add images ]                         [Cancel] [Create only] [Start now]
```

The picker is the same component used in Project Manage. It is seeded from the
current thread's execution when the dialog opens, so the visible model is the
one the new thread is already using. Changing it applies to this task's Start
now and to Improve title & description. `Use project defaults` clears the task
choice; the dialog then follows the project policy or native defaults. Provider
options show logos or a text fallback. The summary names the selected provider
and model so the operator does not need to open a select to know the choice.

The improvement control offers exactly two modes. Concise returns a short
actionable draft. Detailed returns a structured draft with problem, outcome,
scope, acceptance criteria, and risks. The helper uses the task picker when it
has a choice, then the current thread's execution, then project defaults. It
never edits the repository or changes the factory settings.
