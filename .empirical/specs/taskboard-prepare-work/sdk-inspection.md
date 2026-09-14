# BB extension inspection — 2026-09-14

## Repository and baseline
- Clean initial checkout: bb-plugins at /home/dyaus/.bb/worktrees/env_cein3pjug2/bb-plugins, origin https://github.com/MateoCerquetella/bb-plugins.git. Separate from empirical-sdd. Existing plugin: plugins/taskboard, version 0.3.3.
- Active BB project proj_ykxahiys47, thread thr_j2q7vjpsag, managed environment env_cein3pjug2, host host_j7482kf9zh.
- Empirical config schemaVersion 5, setupComplete true; tracker disabled/local-only. Started taskboard-prepare-work complex workflow; Specify requires human-approved UI mockup before implementation.
- npm install completed (567 packages). No tracked lockfile changes. No production plugin changes have been made.

## SDK evidence
Read installed bb-plugin-authoring SKILL.md and backend-sdk, backend-cli-agents, testing references, plus BB CLI, inline-vis, share-server-links and kernel-browser skills.

Inspected node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts and bb-plugin-sdk.d.ts (root installed SDK 0.4.29), and Taskboard's existing registrations in app.tsx around line 7396 and composer-handoff.ts.

- experimental_newThreadPanelAction opens a root New thread side-panel tab. Component props: projectId (nullable) and persisted JSON params. run receives projectId and openPanel. It has no threadId, request submission or automatic thread navigation.
- useComposer exposes current draft text, setText/updateText, quote/mention insertion, focus and input lock. It is not a send-interception API.
- Taskboard currently registers both New thread and existing-thread panels, a thread header action, nav panel and composer create-issue action. Preparation can add its own explicit action without a tracker connection.
- bb.sdk.threads.spawn accepts explicit environment reuse or host/workspace selection, projectId and configured/default execution options. threads.output, get, send and events provide observable job completion. Production design must bind every job to a persisted identifier before consuming outputs and reconcile after restart.
- bb.sdk.environments.get resolves a real environment to projectId, hostId, path and ready/error status. Never assume the plugin server's cwd is the target repository.
- bb.sdk.files operations route by hostId and support rootPath confinement. hosts.experimental_client supports the plugin's bb.host entry, whose experimental_paths.dataDir is persistent per plugin on the executing daemon. These are candidate primitives for filtered repository retrieval and isolated artifact storage.
- The SDK spawn contract does not itself promise a repository read-only jail. Implementation must use bounded prepared context and isolated agent working storage, not rely on prompt instructions to prevent target writes. Verify actual provider/permission behavior before choosing the execution adapter.

## Build prerequisite discovered
Running BB reports 0.42.1. Workspace root pins bb-app 0.40.0 and @get-bb/plugin-sdk 0.4.29; Taskboard pins SDK 0.4.6 and bb-app ^0.38.0. `env -u BB_CLI ./node_modules/.bin/bb plugin types --check plugins/taskboard` fails: tool reports host SDK 0.4.21 and required peer dependency alignment. Resolve Taskboard dependencies against the actual pinned workspace BB before implementing, without letting the running BB_CLI repin them. Newer root declarations alone are not proof that pinned BB supports every candidate API.

## External reference
https://tryhamster.com/ inspected September 14, 2026. Adopt the high-level progression of research/prototypes into a brief and carrying decisions into the handoff. Use an original compact Taskboard experience; no Hamster copying or delivery orchestration.

## Reviewable artifact
One reference-styled clickable preparation-desk direction: mockups/index.html. Served via `empirical mockups` at 127.0.0.1:40147, shared at https://cerq--40147.getbb.app. Server session 85621 (current turn).

## Pending
Human mockup approval, dependency alignment, actual plugin implementation, real BB agent/repository flow, target production digest verification, package/workspace checks, independent review, fidelity report and Empirical evidence. No live integration or completed feature is claimed.

## User refinement: native New thread settings and existing tracker linkage

The user requested reusing the settings shown in BB's New thread composer, with no repeated configuration controls, and checking whether Taskboard's tracker configuration can be reused.

Verified public interfaces:
- PluginNewThreadPanelProps / PluginNewThreadPanelActionContext expose projectId and params/openPanel, not the current unsent provider, model, reasoning, permission, service tier, machine or branch selection.
- ComposerView exposes scope, draft and run status; PluginComposerApi exposes text/mentions/quotes. Neither provides the unsent settings.
- experimental_NewThreadComposer.onSubmit(NewThreadRequest) delivers all selections for THAT composer instance, including executionInputSources. It does not expose the existing root composer's unsent selections to another instance.
- Accordingly, the revised design keeps native New thread submission and binds to the actual resulting thread/environment. Exact marker/correlation, safe bootstrap and panel opening still need live implementation verification; no interception or automatic navigation is claimed. Reusing project defaults is not equivalent to reusing the user's current choices.

Taskboard already supports reuse:
- contract.ts: projectConfigViewSchema returns selected source, Linear team key, Jira scope and GitHub repositories plus credential-configured booleans. No secret values are sent to the UI.
- getProjectConfig RPC calls readProjectConfigView for the selected BB project. buildProjectConfigView resolves the existing GitHub plugin's mapped repositories and checks the per-project credential vault for Linear/Jira.
- listItems reads Taskboard's existing project-scoped cache; getItem delegates to getLiveItem and existing source adapters. Existing selected-source checks reject a provider belonging to another current project configuration.
- Existing task mentions use source/project/locator identifiers in composer-handoff.ts. Reuse these identifiers for explicit optional task references; persist title/URL/source provenance separately with the brief and packet.
- Keep the selected tracker as configured by Taskboard. Do not introduce a second provider chooser or duplicate credentials. A settings link opens the existing Taskboard project settings. New remote search, ticket creation, status changes and synchronization remain deferred.

Updated mockup removes duplicate settings and demonstrates optional Linear/GitHub/Jira task linkage. Its connection-state dropdown is explicitly a mockup test control, not a proposed product setting. New preview server: http://127.0.0.1:45677, shared at https://cerq--45677.getbb.app (session 60184). Old 40147 share removed after the earlier server stopped.
