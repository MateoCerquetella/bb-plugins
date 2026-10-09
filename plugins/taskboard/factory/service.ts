import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { posix, win32 } from 'node:path';
import { formatWorkItemContext, type WorkItem } from '../contract.js';
import type { FactoryIdentity, FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';
import { approvePlan, assertVersion, factoryKey, newRecord, savePlan, scopeDigest, startRun } from './state.js';
import type { createFactoryStore } from './store.js';
import { MAX_REVIEW_REPAIRS, readBuildResult, readReviewResult } from './review.js';

type Store = ReturnType<typeof createFactoryStore>;
type Sdk = BbPluginApi['sdk'];
type Event = Awaited<ReturnType<Sdk['threads']['events']['list']>>[number];
const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1000);
function dispatchRejection(value: string) {
  if (/HTTP 404: Project has no local-path source for (?:host|the primary host)(?:\.|$)/i.test(value)) {
    return 'BB could not find a project checkout on the selected host. Configure the project source with the Git repository folder on that host, then retry.';
  }
  if (/HTTP 400: hostId is required unless workspace\.type is personal/i.test(value)) {
    return 'BB rejected the environment before starting a session. Retry using the project default environment.';
  }
  if (/HTTP 409: This project checkout has no usable git branch\./i.test(value)) {
    return 'BB could not create a worktree because the project checkout has no usable Git branch. Repair the project checkout, then retry.';
  }
  return null;
}
class SessionBusyError extends Error {}

export function applyNativeEvent(run: FactoryRun, event: Event) {
  if (event.seq <= run.cursor) return;
  run.cursor = event.seq;
  if (event.type === 'turn/started') {
    run.status = 'running';
    run.output = '';
    run.reviewResult = null;
    run.buildResult = null;
    run.updates = [];
    run.checks = [];
    run.changedFiles = [];
    run.steps = [];
    run.finishedAt = null;
    run.turnId = event.scope.kind === 'turn' ? event.scope.turnId : null;
    run.activity = 'Agent working';
    run.error = null;
  } else if (event.type === 'turn/plan/updated') {
    run.steps = event.data.plan.slice(0, 50).map(step => ({
      step: step.step.slice(0, 500), status: step.status ?? 'pending'
    }));
    const step = event.data.plan.find(step => step.status === 'active');
    if (step) run.activity = step.step.slice(0, 500);
  } else if (event.type === 'item/started') {
    const item = event.data.item;
    run.activity = item.type === 'commandExecution'
      ? `Running: ${item.command.slice(0, 450)}`
      : item.type === 'fileChange' ? 'Editing files'
      : item.type === 'agentMessage' ? 'Writing response' : 'Agent activity in native thread';
  } else if (event.type === 'item/completed') {
    const item = event.data.item;
    if (item.type === 'commandExecution') {
      run.checks = [...run.checks.filter(check => check.id !== item.id), {
        id: item.id, command: item.command.slice(0, 2000),
        exitCode: item.exitCode ?? null, output: (item.aggregatedOutput ?? '').slice(-8000)
      }].slice(-50);
    } else if (item.type === 'agentMessage' && item.text.trim()) {
      run.updates = [...run.updates.filter(update => update.id !== item.id), {
        id: item.id, text: item.text.slice(-8000), at: new Date(event.createdAt).toISOString()
      }].slice(-12);
    } else if (item.type === 'fileChange') {
      run.changedFiles = [...new Set([...run.changedFiles, ...item.changes.map(change => change.path)])].slice(0, 200);
    }
  } else if (event.type === 'turn/completed') {
    if (run.turnId && event.scope.kind === 'turn' && run.turnId !== event.scope.turnId) return;
    run.status = event.data.status === 'completed' ? 'finished'
      : event.data.status === 'interrupted' ? 'canceled' : 'failed';
    run.error = event.data.error?.message.slice(0, 1000) ?? null;
    run.activity = run.status === 'finished' ? 'Turn finished; work not accepted'
      : run.status === 'canceled' ? 'Agent stopped' : 'Agent turn failed';
    run.finishedAt = new Date(event.createdAt).toISOString();
  } else if (event.type === 'system/thread/interrupted') {
    run.status = 'canceled';
    run.activity = `Interrupted: ${event.data.reason}`;
    run.finishedAt = new Date(event.createdAt).toISOString();
  }
}

export function factoryPrompt(item: WorkItem, record: FactoryRecord, kind: FactoryRunKind) {
  const build = [...record.runs].reverse().find(run => run.kind === 'build' && run.threadId);
  const repair = record.runs.at(-1)?.repairOf;
  const review = repair ? record.runs.find(run => run.id === repair) : null;
  const continuation = record.runs.at(-1)?.continuationOf;
  const blockedBuild = continuation ? record.runs.find(run => run.id === continuation) : null;
  const instruction = {
    investigate: 'Investigate this issue in the repository. Report findings, relevant files, risks and proposed verification. Do not implement yet.',
    plan: 'Produce an implementation plan based on the investigation. Include scope, acceptance criteria, files and exact verification commands. Return the plan in your final response. Do not implement yet.',
    build: 'Implement only the approved plan below. Respect repository instructions. Run appropriate verification and report actual commands, outcomes, changed files and implementation revision. Do not merge, deploy, or close the tracker item.',
    review: 'Review the implementation against the approved plan below. Inspect changes and run appropriate checks. Report findings with file references and verification evidence. Do not modify, merge, deploy, close the tracker item, or claim human acceptance.'
  }[kind];
  return [
    instruction,
    'Use BB native tools and repository instructions. Taskboard does not impose a workflow runtime.',
    'A finished turn is not accepted work. Report failures and missing evidence plainly.',
    formatWorkItemContext(item),
    kind === 'build' || kind === 'review'
      ? `Approved plan digest: ${record.approvedDigest}\n${record.plans.at(-1)?.body ?? ''}` : '',
    kind === 'build' ? 'End your final response with exactly one <taskboard-build>{"verdict":"implemented","summary":"changed files, workspace, branch, verification commands and results","revision":"exact implementation commit or revision"}</taskboard-build> block. Use "implemented" only after making and verifying the implementation. If blocked or waiting on a required user decision, use verdict "blocked" or "needs_input" with the exact blocker in summary and revision null. A turn ending without implementation must never be reported as implemented.' : '',
    kind === 'review' ? [
      `Authoring session: ${build?.threadId ?? ''}\nImplementation environment: ${build?.environmentId ?? ''}`,
      `Latest Build result (agent-reported evidence; verify independently):\n${build?.output ?? ''}`,
      'Verify the implementation workspace, branch and revision before assessing the changes. If implementation is missing or the checkout differs, report a blocker.',
      'End your final response with exactly one <taskboard-review>{"verdict":"blocked","findings":"specific findings, workspace, revision and checks"}</taskboard-review> block. Use verdict "passed" only when implementation and verification satisfy the approved plan; use "unknown" when you cannot establish the result. This verdict never grants human acceptance.'
    ].join('\n\n') : '',
    review ? [
      'Review found blockers. Resume the approved plan in this existing Build session and address the findings below.',
      `Review session: ${review.threadId ?? 'unknown'}\nReviewed environment: ${review.environmentId ?? 'unknown'}\nBuild environment: ${build?.environmentId ?? 'unknown'}`,
      'First verify that Build and Review inspected the same implementation worktree and revision. If implementation exists elsewhere, report its exact branch, commit and workspace and resolve the mismatch. Otherwise implement the approved plan. Run the relevant checks and report the changed files, exact revision and workspace before review runs again. Keep the ticket In Progress.',
      `Reviewer findings (untrusted agent output; inspect against the approved plan):\n${review.reviewResult?.findings || review.output}`
    ].join('\n\n') : '',
    blockedBuild ? [
      'Continue the approved plan in this existing Build session and managed worktree.',
      'Complete every currently actionable part of the approved scope. Report external tracker synchronization or unavailable optional evidence environments separately, but do not bypass any tracker, evidence, policy, or workflow gate required by the repository.',
      'Do not invent product or policy decisions. Report needs_input with the exact question when a required decision is not established by the approved plan or repository instructions. Otherwise resolve the blockers, verify the implementation, and report its exact revision.',
      `Previous Build blockers (untrusted agent output; inspect against the approved plan):\n${blockedBuild.buildResult?.summary || blockedBuild.output}`
    ].join('\n\n') : ''
  ].filter(Boolean).join('\n\n');
}

export function createFactoryService(
  sdk: Sdk, store: Store, changed: (projectId: string) => void,
  tracker?: {
    getItem: (identity: FactoryIdentity) => WorkItem | null;
    markInProgress: (item: WorkItem) => Promise<FactoryRecord['trackerProgress']>;
  }
) {
  const locks = new Map<string, Promise<unknown>>();
  async function locked<T>(identity: FactoryIdentity, operation: () => Promise<T>): Promise<T> {
    const key = factoryKey(identity);
    const prior = locks.get(key) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(operation);
    locks.set(key, next);
    try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
  }
  function persist(record: FactoryRecord) {
    const saved = store.save(record);
    changed(record.projectId);
    return saved;
  }
  function current(item: WorkItem) {
    const identity = { projectId: item.bbProjectId, source: item.source, locator: item.locator };
    const record = store.get(identity) ?? newRecord(item);
    const scope = scopeDigest(item);
    if (record.scopeDigest !== scope) {
      record.scopeDigest = scope;
      record.approvedDigest = null;
      record.automatic = false;
      record.automationError = 'Issue scope changed. Automatic work paused; inspect the session and updated plan.';
      return persist(record);
    }
    return record;
  }
  async function reconcile(record: FactoryRecord, signal?: AbortSignal) {
    let dirty = false;
    // Only known preflight rejections are safe to expose as retryable.
    for (const run of record.runs) {
      const rejection = run.error && dispatchRejection(run.error);
      if (run.status === 'uncertain' && !run.threadId && rejection) {
        run.status = 'failed';
        run.activity = 'Native session was not started';
        run.error = rejection;
        dirty = true;
      }
    }
    // Also observe resumed native turns on the newest author/review session.
    const sessions = new Set<string>();
    for (const run of [...record.runs].reverse()) {
      if (!run.threadId || sessions.has(run.threadId) || run.status === 'starting') continue;
      sessions.add(run.threadId);
      const before = JSON.stringify(run);
      try {
        const thread = await sdk.threads.get({ threadId: run.threadId, signal });
        if (thread.projectId !== record.projectId) throw new Error('Linked thread belongs to another project.');
        if (run.environmentId && run.environmentId !== thread.environmentId) {
          throw new Error('Linked native session changed workspace. Restore the implementation environment before continuing.');
        }
        run.environmentId = thread.environmentId;
        const events = await sdk.threads.events.list({
          threadId: run.threadId, afterSeq: String(run.cursor), order: 'asc', limit: '100', signal
        });
        const resumedBuild = run === record.runs.at(-1) && run.kind === 'build' &&
          run.status === 'finished' && events.some(event => event.type === 'turn/started' && event.seq > run.cursor);
        for (const event of events) applyNativeEvent(run, event);
        if (resumedBuild && record.automationError?.startsWith('Automatic work paused: Build ') &&
          run.planDigest === record.approvedDigest && run.scopeDigest === record.scopeDigest) {
          record.automationError = null;
          dirty = true;
        }
        if (thread.status === 'error' || thread.deletedAt || thread.archivedAt) {
          run.status = 'failed';
          run.error = 'Native session is unavailable or failed. Open its thread for details.';
        } else if (['active', 'starting', 'stopping'].includes(thread.status) &&
          !['finished', 'failed', 'canceled'].includes(run.status)) {
          run.status = 'running';
          if (thread.status === 'stopping') run.activity = 'Stopping agent';
        }
        if (run.status === 'finished' && !run.output) {
          const { output } = await sdk.threads.output({ threadId: run.threadId, signal });
          run.output = (output ?? '').slice(-100_000);
        }
        if (run.kind === 'review' && run.status === 'finished' && run.output && !run.reviewResult) {
          run.reviewResult = readReviewResult(run.output);
          run.activity = run.reviewResult.verdict === 'blocked' ? 'Review found blockers'
            : run.reviewResult.verdict === 'passed' ? 'Review passed; work acceptance pending'
            : 'Review result needs attention';
        }
        if (run.kind === 'build' && run.status === 'finished' && run.output && !run.buildResult) {
          run.buildResult = readBuildResult(run.output);
          if (run.buildResult.verdict === 'needs_input') run.activity = 'Build needs input';
          if (run.buildResult.verdict === 'blocked') run.activity = 'Build found blockers';
        }
        if (run.error?.startsWith('Could not read native session:')) run.error = null;
      } catch (error) {
        if (signal?.aborted) throw error;
        run.error = `Could not read native session: ${message(error)}`;
      }
      dirty ||= JSON.stringify(run) !== before;
    }
    return dirty ? persist(record) : record;
  }
  async function syncProgress(item: WorkItem, record: FactoryRecord) {
    if (!tracker || record.trackerProgress.status !== 'pending' ||
      !record.runs.some(run => run.threadId && ['running', 'finished'].includes(run.status))) return record;
    try {
      record.trackerProgress = await tracker.markInProgress(item);
    } catch (error) {
      record.trackerProgress = { status: 'failed', message: `Could not move issue to In progress: ${message(error)}` };
    }
    return persist(record);
  }
  async function advance(item: WorkItem, record: FactoryRecord, signal?: AbortSignal) {
    record = await syncProgress(item, record);
    const run = record.runs.at(-1);
    if (!record.automatic || record.automationError || !run || run.status !== 'finished' ||
      run.error || signal?.aborted || !(['investigate', 'plan', 'review'].includes(run.kind) ||
        (run.kind === 'build' && (run.repairOf || run.continuationOf)))) return record;
    if (run.kind === 'review' && run.reviewResult?.verdict !== 'blocked') return record;
    try {
      if (['done', 'canceled'].includes(item.stateCategory)) {
        throw new Error('Issue was closed or canceled. Reopen it before starting more work.');
      }
      if (run.scopeDigest && run.scopeDigest !== record.scopeDigest) {
        throw new Error('Issue scope changed since this run. Start task again to investigate the updated issue.');
      }
      if (run.kind === 'plan') {
        if (!run.output.trim()) throw new Error('Planning finished without a plan. Inspect the native session and retry planning.');
        const saved = record.plans.at(-1);
        // Preserve a human-edited plan saved after this planning turn started.
        if (!saved || saved.scopeDigest !== record.scopeDigest || saved.createdAt < run.startedAt) savePlan(record, run.output);
        approvePlan(record, record.plans.at(-1)!.digest);
        // Approval is durable before any native build dispatch.
        record = persist(record);
      }
      if (run.kind === 'review') return await repairReview(item, record);
      if (run.kind === 'build' && run.buildResult?.verdict !== 'implemented') {
        throw new Error(run.buildResult?.verdict === 'needs_input'
          ? `Build needs input: ${run.buildResult.summary.slice(0, 1000)}`
          : run.buildResult?.verdict === 'blocked' ? `Build found blockers: ${run.buildResult.summary.slice(0, 1000)}`
          : 'Build did not report a verified implementation revision. Inspect the Build result before requesting another review.');
      }
      return await dispatch(item, record, {
        kind: run.kind === 'investigate' ? 'plan' : run.kind === 'build' ? 'review' : 'build',
        contextThreadId: null, retry: false
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      // Completion events can precede the native session becoming idle. Keep
      // the completed run and let the next poll continue instead of pausing.
      if (error instanceof SessionBusyError) return record;
      record.automationError = `Automatic work paused: ${message(error)}`;
      return persist(record);
    }
  }
  async function repairReview(item: WorkItem, record: FactoryRecord) {
    const review = record.runs.at(-1);
    if (!review || review.kind !== 'review' || review.status !== 'finished' || !review.output.trim()) {
      throw new Error('Finish review and collect its findings before returning to Build.');
    }
    if (['done', 'canceled'].includes(item.stateCategory)) throw new Error('Reopen the issue before starting more work.');
    if (review.planDigest !== record.approvedDigest || review.scopeDigest !== record.scopeDigest) {
      throw new Error('Review findings are stale. Approve the current plan before continuing.');
    }
    if (review.reviewResult?.verdict === 'passed') throw new Error('Review passed; work acceptance is pending.');
    if (review.threadId) {
      const thread = await sdk.threads.get({ threadId: review.threadId });
      if (thread.projectId !== record.projectId || thread.deletedAt || thread.archivedAt) {
        throw new Error('The review session is unavailable. Restore its link before continuing.');
      }
      if (thread.status !== 'idle') throw new SessionBusyError('Wait for the review session to finish before resuming Build.');
    }
    const repairs = record.runs.filter(run => run.kind === 'build' && run.repairOf &&
      run.planDigest === record.approvedDigest && run.scopeDigest === record.scopeDigest).length;
    if (repairs >= MAX_REVIEW_REPAIRS) {
      throw new Error(`Review repair limit reached (${MAX_REVIEW_REPAIRS} attempts). Inspect the findings and revise the plan before continuing.`);
    }
    record.automatic = true;
    return dispatch(item, record, { kind: 'build', contextThreadId: null, retry: false, repairOf: review.id });
  }
  async function resumeBlockedBuild(item: WorkItem, record: FactoryRecord) {
    const blocked = record.runs.at(-1)!;
    if (['done', 'canceled'].includes(item.stateCategory)) throw new Error('Reopen the issue before starting more work.');
    if (blocked.planDigest !== record.approvedDigest || blocked.scopeDigest !== record.scopeDigest) {
      throw new Error('Build blockers are stale. Approve the current plan before continuing.');
    }
    record.automatic = true;
    record.automationError = null;
    return dispatch(item, record, {
      kind: 'build', contextThreadId: null, retry: false, continuationOf: blocked.id
    });
  }
  async function dispatch(item: WorkItem, record: FactoryRecord, input: {
    kind: FactoryRunKind; contextThreadId: string | null; retry: boolean; repairOf?: string; continuationOf?: string;
  }) {
    const author = [...record.runs].reverse().find(run => run.kind !== 'review' && run.threadId);
    const contextId = author?.threadId ?? input.contextThreadId;
    const context = contextId ? await sdk.threads.get({ threadId: contextId }) : null;
    if (context && context.projectId !== item.bbProjectId) throw new Error('Select a thread in this ticket project.');
    if (context && (context.deletedAt || context.archivedAt)) throw new Error('Restore the original authoring session before continuing.');
    if (author && context?.status !== 'idle') throw new SessionBusyError('Stop or finish the authoring session first.');
    const defaults = context
      ? await sdk.threads.defaultExecutionOptions({ threadId: context.id })
      : await sdk.projects.defaultExecutionOptions({ projectId: item.bbProjectId });
    if (!defaults) throw new Error('Choose native BB model and execution settings for this project first.');
    const environment = context?.environmentId
      ? await sdk.environments.get({ environmentId: context.environmentId }) : null;
    const isolateBuild = input.kind === 'build' && (!environment?.managed || !environment.isWorktree);
    if ((input.repairOf || input.continuationOf) && (isolateBuild || !author?.threadId || author.kind !== 'build' ||
      (input.continuationOf && author.id !== input.continuationOf) || author.environmentId !== context?.environmentId)) {
      throw new Error('Build continuation requires the original Build session and managed worktree. Restore that workspace before continuing.');
    }
    if (input.kind === 'review' && (!environment || author?.kind !== 'build' ||
      author.environmentId !== environment.id)) {
      throw new Error('Review requires the current Build workspace. Restore the linked implementation environment first.');
    }
    if (isolateBuild && (!author?.threadId || !environment)) {
      throw new Error('Build requires a linked native planning session and environment.');
    }
    // Project-default investigation can use a plain checkout. Preserve its
    // conversation by forking Build into a managed worktree in one dispatch.
    const reuse = input.kind !== 'review' && !isolateBuild && author?.threadId;
    const events = reuse
      ? await sdk.threads.events.list({ threadId: reuse, order: 'desc', limit: '1' }) : [];
    const draft = startRun(record, input.kind, input.retry);
    draft.repairOf = input.repairOf ?? null;
    draft.continuationOf = input.continuationOf ?? null;
    if (reuse) {
      draft.threadId = reuse;
      draft.environmentId = context!.environmentId;
      draft.cursor = events[0]?.seq ?? 0;
    }
    const id = draft.id;
    record = persist(record);
    const run = record.runs.find(run => run.id === id)!;
    try {
      const prompt = factoryPrompt(item, record, input.kind);
      if (reuse) {
        await sdk.threads.send({
          threadId: reuse, input: [{ type: 'text', text: prompt, mentions: [] }], mode: 'start'
        });
      } else {
        const thread = await sdk.threads.spawn({
          ...defaults,
          ...(context ? { providerId: context.providerId } : {}),
          ...(isolateBuild ? { originKind: 'fork' as const, sourceThreadId: author!.threadId! } : {}),
          projectId: item.bbProjectId,
          environment: input.kind === 'review' && environment
            ? { type: 'reuse', environmentId: environment.id }
            : environment
              ? { type: 'host', hostId: environment.hostId,
                  workspace: { type: 'managed-worktree', baseBranch: { kind: 'default' } } }
              : { type: 'project-default' },
          title: `${item.key}: ${input.kind}`,
          prompt
        });
        run.threadId = thread.id;
        run.environmentId = thread.environmentId;
      }
      run.status = 'running';
      run.activity = 'Waiting for native agent events';
    } catch (error) {
      const detail = message(error);
      const rejection = dispatchRejection(detail);
      if (rejection) {
        run.status = 'failed';
        run.activity = 'Native session was not started';
        run.error = rejection;
      } else {
        // Even a transport exception may have committed a native dispatch.
        run.status = 'uncertain';
        run.error = `Native dispatch outcome uncertain: ${detail}. Inspect recent BB threads; no automatic retry.`;
      }
    }
    return syncProgress(item, persist(record));
  }
  return {
    async diff(identity: FactoryIdentity, runId: string, path: string) {
      const run = store.get(identity)?.runs.find(candidate => candidate.id === runId);
      if (!run || !run.changedFiles.includes(path)) throw new Error('File is not part of this run.');
      if (!run.environmentId || !run.threadId) {
        return { patch: null, message: 'This run has no available workspace.', truncated: false };
      }
      const thread = await sdk.threads.get({ threadId: run.threadId });
      if (thread.projectId !== identity.projectId || thread.environmentId !== run.environmentId) {
        throw new Error('The session workspace changed. Diff is unavailable.');
      }
      const environment = await sdk.environments.get({ environmentId: run.environmentId });
      if (environment.projectId !== identity.projectId) throw new Error('Workspace project mismatch.');
      const paths = environment.path?.includes('\\') ? win32 : posix;
      const relativePath = paths.isAbsolute(path) && environment.path ? paths.relative(environment.path, path) : path;
      if (paths.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..') || relativePath.includes('\0')) {
        throw new Error('File is outside the run workspace.');
      }
      const result = await sdk.environments.diffPatch({
        environmentId: run.environmentId, paths: [relativePath],
        target: environment.mergeBaseBranch
          ? { type: 'all', mergeBaseBranch: environment.mergeBaseBranch }
          : { type: 'uncommitted' }
      });
      if (result.outcome !== 'available') return {
        patch: null, message: result.outcome === 'unavailable' ? result.failure.message : result.message,
        truncated: false
      };
      const file = result.patches.find(candidate => candidate.path === relativePath);
      return {
        patch: file?.patch ? file.patch.slice(0, 200_000) : null,
        message: file?.patch ? null : 'No current patch is available. The file may be committed, unchanged, or binary.',
        truncated: !!file && (file.truncated || file.patch.length > 200_000)
      };
    },
    async get(item: WorkItem, signal?: AbortSignal) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () =>
        advance(item, await reconcile(current(item), signal), signal));
    },
    async startTask(item: WorkItem, contextThreadId: string | null) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        let record = current(item);
        const run = record.runs.at(-1);
        if (run && ['starting', 'running', 'uncertain'].includes(run.status)) return syncProgress(item, record);
        if (run?.status === 'finished' && ['build', 'review'].includes(run.kind)) {
          if (run.kind === 'build' && (run.buildResult ?? readBuildResult(run.output)).verdict === 'blocked') {
            return resumeBlockedBuild(item, record);
          }
          if ((run.kind === 'review' && run.reviewResult?.verdict === 'blocked') || run.repairOf || run.continuationOf) {
            record.automatic = true;
            record.automationError = null;
            return advance(item, persist(record));
          }
          return record;
        }
        if (['done', 'canceled'].includes(item.stateCategory)) throw new Error('Reopen the issue before starting a task.');
        record.automatic = true;
        record.automationError = null;
        record = persist(record);
        if (run?.scopeDigest && run.scopeDigest !== record.scopeDigest) {
          return dispatch(item, record, { kind: 'investigate', contextThreadId, retry: false });
        }
        if (!run || ['failed', 'canceled'].includes(run.status)) {
          return dispatch(item, record, { kind: run?.kind ?? 'investigate', contextThreadId, retry: !!run });
        }
        if (run.kind === 'plan' && !run.output.trim()) {
          return dispatch(item, record, { kind: 'plan', contextThreadId, retry: false });
        }
        return advance(item, record);
      });
    },
    async retryStatus(item: WorkItem) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const record = current(item);
        record.trackerProgress = { status: 'pending', message: null };
        return syncProgress(item, persist(record));
      });
    },
    forThread: (threadId: string) => store.forThread(threadId),
    async linkRecovered(item: WorkItem, expectedVersion: number, threadId: string) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const record = current(item);
        assertVersion(record, expectedVersion);
        const run = record.runs.at(-1);
        if (!run || run.status !== 'uncertain') throw new Error('Only an uncertain dispatch needs recovery.');
        if (run.threadId && run.threadId !== threadId) throw new Error('Recover the already-linked native session.');
        const thread = await sdk.threads.get({ threadId });
        if (thread.projectId !== record.projectId || thread.deletedAt || thread.archivedAt) {
          throw new Error('Choose an available native thread in this ticket project.');
        }
        if (!run.threadId && (thread.title !== `${item.key}: ${run.kind}` ||
          thread.createdAt < Date.parse(run.startedAt) - 5000)) {
          throw new Error('This thread does not match the uncertain dispatch title and creation time.');
        }
        run.threadId = thread.id;
        run.environmentId = thread.environmentId;
        run.status = 'running';
        run.error = null;
        return reconcile(persist(record));
      });
    },
    async savePlan(item: WorkItem, expectedVersion: number, body: string) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const record = current(item);
        assertVersion(record, expectedVersion);
        savePlan(record, body);
        record.automatic = false;
        return persist(record);
      });
    },
    async approve(item: WorkItem, expectedVersion: number, hash: string) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const record = current(item);
        assertVersion(record, expectedVersion);
        approvePlan(record, hash);
        return persist(record);
      });
    },
    async start(item: WorkItem, input: {
      expectedVersion: number; kind: FactoryRunKind; contextThreadId: string | null; retry: boolean;
    }) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        let record = current(item);
        const last = record.runs.at(-1);
        // A stale duplicate button press returns the original dispatch, never spawns.
        if (last && last.kind === input.kind && input.expectedVersion < record.version &&
          last.status !== 'uncertain') return record;
        assertVersion(record, input.expectedVersion);
        record.automationError = null;
        if (input.kind === 'build' && last?.kind === 'review' && last.status === 'finished') {
          return repairReview(item, record);
        }
        return dispatch(item, record, input);
      });
    },
    async recover() {
      for (const record of store.all()) {
        await locked(record, async () => {
          const latest = store.get(record)!;
          let dirty = false;
          for (const run of latest.runs) if (run.status === 'starting') {
            run.status = 'uncertain';
            run.error = 'BB restarted during dispatch. Inspect native threads before proceeding; no duplicate was started.';
            dirty = true;
          }
          if (dirty) persist(latest);
        });
      }
    },
    async poll(signal: AbortSignal) {
      for (const record of store.all()) {
        if (signal.aborted) return;
        await locked(record, async () => {
          const item = tracker?.getItem(record);
          if (item) await advance(item, await reconcile(current(item), signal), signal);
          else await reconcile(store.get(record)!, signal);
        });
      }
    }
  };
}
