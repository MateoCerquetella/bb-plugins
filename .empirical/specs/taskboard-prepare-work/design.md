# Design

## Entry and native settings
Register Prepare work as a native New thread panel and a thread panel/header action. A composer-scoped control captures the current user draft into a durable preparation record, then inserts a Taskboard preparation mention. Normal BB Send remains responsible for project, provider, model, reasoning, service tier, machine, branch and permission selection. The mention supplies a narrow bootstrap instruction to call the preparation-start tool and stop. The tool verifies the calling thread/project, binds the record once, resolves the actual environment/host and records the thread's resolved execution options. It does not execute target implementation. The header action opens the preparation panel when a bound preparation exists; manual opening remains supported.

## Storage and jobs
Use a separate Taskboard SQLite database for preparation records with optimistic revision checks. Persist original request, brief history, sources, messages, task references, selection and jobs. Jobs are saved before spawn, run in plugin host data storage, and are reconciled against durable BB thread status after reload. A crash during ambiguous spawn fails visibly instead of silently duplicating it; explicit individual retry creates a new job. Generation count is 1–4, default 2. Each job snapshots its generating brief and directions. Successful HTML versions append; failed siblings remain retryable. Stale brief results become explicit proposals.

## Repository context and isolation
A typed plugin host entry executes on the selected environment's host. It builds a capped tracked-file inventory and ranks relevant docs/features/components/tokens/routes/Empirical context. Read only bounded UTF-8 regular files, reject symlinks/out-of-root paths, secret filenames and likely credentials, and omit generated files. Return visible source paths, ranges, hashes and an inventory summary. Agent jobs receive only this curated data and a separate working directory under the host's plugin data directory. No production code is written by plugin operations. The native bootstrap instruction is not an OS sandbox; only the bounded preparation tool should be used there, and live checks must verify the target remains unchanged.

## Brief, preview and handoff
Render the actual preparation panel with BB tokens and vendored Taskboard controls. Provide editable title/description, revision history, source excerpts, conversation, per-alternative progress/version selection/preview/retry/refine, readiness and downloadable packet. HTML executes in an opaque-origin iframe with sandbox=allow-scripts and restrictive CSP; it cannot access BB origin, fetch resources, submit forms or navigate the parent. Persist HTML as data, never eval on the server or host. Export contains Markdown brief, sources, open questions, decisions and selected HTML plus provenance; never launch Empirical or change a tracker.

## Existing tracker reuse
Inject existing project-scoped Taskboard cache/detail/config helpers into preparation registration. Optional task linkage validates the current project/source/locator and stores a safe reference. Existing Taskboard settings remain the only credential configuration. Tracker failures do not block preparation.

## Verification
Unit tests cover safe context selection, source secret exclusion, parser limits, preview CSP, CAS conflicts, version/retry preservation and remote host routing. Build/type checks then install/reload real Taskboard. Exercise native New thread send through configured BB agent, source-backed brief/edit, two generated alternatives, refinement/selection, reload/export, and target digest checks. Test BB in its own browser automation surface; do not create a mockup server.
