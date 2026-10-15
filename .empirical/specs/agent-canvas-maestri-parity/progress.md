# Implementation checkpoint — 2026-10-06

Resumed source thread thr_aqv6qu8c3s on its existing checkout/branch.
Goal active in new thread thr_i92zicydn5; no scope reduction or new approval is
required. The user previously approved the mockup and autonomous continuation.
Empirical loop returned Implement/waiting revision 5, tracker local-only.
Do not complete this phase until the remaining portable acceptance work is done.

Checkpoint commit 9526ce34 is pushed to
`continue-working-on-agent-canvas-thr_rijqhenqpa`. Draft PR:
https://github.com/MateoCerquetella/bb-plugins/pull/69

Implemented baseline + persistent spatial document/Workbench, version checks,
scoped notes, file resources, native launch/role/stop actions, Maestro team tool
and initial floor creation/review surfaces. Removed unused baseline workspace
renderer. Tests cover model references/history/lock, stale saves, notes and
Maestro ownership/inherited permissions. Latest `npm run check --workspace
plugins/agent-canvas` passed with 18 tests, typecheck, SDK check and build;
root npm install/check passed before the final added actions. Local plugin is
installed/reloaded; CLI snapshot was exercised. Fixture browser checks passed.
Authenticated live BB UI evidence is pending; BB Connect showed sign-in when
the fixture share URL was visited. No external browser was opened.

Remaining: genuine project Steel portal interaction (saved URL currently only),
terminal views, native routines, connected composer mentions, individual library
transfer/collection placement refinements, host file evidence, comprehensive
browser scenarios, native capability inventory, fresh-context review, Empirical
receipts/sync target/independent integration. parity.md tracks gaps.

Next integration research: installed Automations builtin at
`/home/dyaus/.local/share/bb-releases/0.45.0/node_modules/bb-app/server/dist/builtin-plugins/automations`.
`bb plugin rpc list/inspect automations` returns [] (not published), but the
registered contract in dist/server.js provides `automations_list` input
{projectId}, returning an array; `automations_create` input {projectId,name,
enabled,trigger,execution,origin,createdByThreadId?}, returning an automation.
Native triggers: {triggerType:"schedule",cron,timezone} or {triggerType:"once",
runAt}. Agent execution: {mode:"agent",prompt,providerId,model,reasoningLevel,
serviceTier?,permissionMode,environment,targetThreadId?}. Need establish a
supported tested bridge, preserving native validation and explicit human action.
No automations were created during research.

Steel project binding from `bb steel-browser project`: API 3210, CDP 9320,
viewer cerq--3210. Validate again before browser use. Its verified container is
bb-steel-86e276a462b4d894745fd342 (label bb.steel.project=proj_ykxahiys47).
Fixture served by python on 127.0.0.1:8769 inside that container; host fixture
also at /tmp/agent-canvas-ui via temporary server, public share
https://cerq--8769.getbb.app. CDP browser attachment stalled, direct page CDP
worked. Browser helpers are in research/browser/. Never use another project's
container or binding. An initially mistaken fixture copy/server in a different
container was immediately removed and stopped; no browser/session/cookies
there were used.

Unrelated initial .empirical config changes and journal deletions/closure files
were left untouched and unstaged. Continue preserving them.

## Pass 2 — native integrations

Added native routine CRUD/activation controls (created paused), portal navigation
and interactive viewer, real thread PTY+xterm view, signed native note mentions,
independent versioned ensemble/note libraries and reusable collection placement.
Added responsive viewport preservation after the library browser check found
nodes off-screen on return from narrow mode. New floor defaults now use the
registered provider id `git-worktree`; legacy host/worktree requests still work.
Checks/evidence are in research/verification-2026-10-06.md. Latest focused checks:
Agent Canvas 24 tests and Steel 40 tests, types, SDK and build; root checks passed
before the final viewport fix. Both fixture scripts now pass and guard origin.

Installed Steel was externally switched to thr_93e5633gqa during this pass. Its
thread is errored and its PR #68 merged; running Steel lacks our new navigate
RPC. Do not repeatedly overwrite installation choices. Reconcile PR #68's
healthy-share recovery against this branch before final combined integration.
The project binding remains API 3210/CDP 9320; validate before browser work.

Next: sequential routine chains (native SendMessageResponse has no turn id;
queue group/create/send semantics need evidence), richer fuzzy/body/action search,
portal design/annotation, settings/navigation and remaining reference audit,
more host filesystem and installed UI evidence, then review/Empirical receipts,
sync target and independent integration. The default verification command
selection still names other plugins; configure evidence for this feature rather
than treating an Action Topbar check as Agent Canvas acceptance evidence.
