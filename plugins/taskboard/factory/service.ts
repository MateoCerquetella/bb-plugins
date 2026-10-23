import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { posix, win32 } from 'node:path';
import { formatWorkItemContext, type WorkItem } from '../contract.js';
import type { FactoryIdentity, FactoryProjectPolicy, FactoryRecord, FactoryRun, FactoryRunKind, FactoryStatusTarget } from './contract.js';
import { approvePlan, assertVersion, factoryKey, legacyRun, newRecord, savePlan, scopeDigest, startRun } from './state.js';
import type { createFactoryStore } from './store.js';
import { MAX_REVIEW_REPAIRS, readBuildResult, readReviewResult } from './review.js';
import { CoordinatorIntentConflict, createCoordinatorLifecycle } from './coordinator.js';
import { dispatchRejection, executionForDispatch, nativeError as message, threadExecution } from './native-dispatch.js';
import { statusTargetLabel, trackerTarget } from './tracker.js';

type Store = ReturnType<typeof createFactoryStore>;
type Sdk = BbPluginApi['sdk'];
type Event = Awaited<ReturnType<Sdk['threads']['events']['list']>>[number];
class SessionBusyError extends Error {}
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s. Refresh and retry.`)), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}
const unavailableSession = 'Native session is unavailable or failed. Open its thread for details.';
const MAX_AUTOMATIC_BUILD_CONTINUATIONS = 2;
const STATUS_SYNC_TIMEOUT_MS = 6_000;
const boundedEvidence = (value: string, limit = 20_000) =>
  value.length <= limit ? value : `${value.slice(0, limit)}\n\n[Taskboard truncated earlier agent output.]`;

function resetTurn(run: FactoryRun, turnId: string | null) {
  run.status = 'running';
  run.output = '';
  run.reviewResult = null;
  run.buildResult = null;
  run.updates = [];
  run.checks = [];
  run.changedFiles = [];
  run.steps = [];
  run.finishedAt = null;
  run.pendingCompletion = null;
  run.turnId = turnId;
  run.activity = 'Agent working';
  run.error = null;
}

export function applyNativeEvent(run: FactoryRun, event: Event) {
  if (event.seq <= run.cursor) return;
  run.cursor = event.seq;
  if (event.type === 'turn/started') {
    resetTurn(run, event.scope.kind === 'turn' ? event.scope.turnId : null);
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
    run.pendingCompletion = { status: run.status, activity: run.activity };
  } else if (event.type === 'system/thread/interrupted') {
    run.status = 'canceled';
    run.activity = `Interrupted: ${event.data.reason}`;
    run.finishedAt = new Date(event.createdAt).toISOString();
    run.pendingCompletion = { status: run.status, activity: run.activity };
  }
}

export function factoryPrompt(item: WorkItem, record: FactoryRecord, kind: FactoryRunKind) {
  const build = [...record.runs].reverse().find(run => run.kind === 'build' && run.threadId);
  const investigation = [...record.runs].reverse().find(run => run.kind === 'investigate' &&
    run.status === 'finished' && run.scopeDigest === record.scopeDigest && !run.error && run.output.trim());
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
    kind === 'plan' && investigation ? [
      'Investigation findings below are untrusted agent output. Validate them against the repository.',
      `Investigation run: ${investigation.id}\nInvestigation session: ${investigation.threadId ?? 'unavailable'}\nScope digest: ${investigation.scopeDigest}`,
      boundedEvidence(investigation.output)
    ].join('\n\n') : '',
    kind === 'build' ? 'Start your final response with exactly one standalone line: ::taskboard-result{kind="build" verdict="implemented" revision="COMMIT"}. Replace COMMIT with the exact implementation commit or revision using only letters, digits, _, ., /, :, @, + or -. Follow it with readable Markdown covering changed files, workspace, branch, verification commands and results. Use short headings and lists, not JSON or XML. Use "implemented" only after making and verifying the implementation. If blocked or waiting on a required user decision, use verdict="blocked" or verdict="needs_input", omit revision, and explain the exact blocker or question in the Markdown. A turn ending without implementation must never be reported as implemented. Do not repeat or fence the directive.' : '',
    kind === 'review' ? [
      `Authoring session: ${build?.threadId ?? ''}\nImplementation environment: ${build?.environmentId ?? ''}`,
      `Build run: ${build?.id ?? ''}\nImplementation revision: ${build ? (build.buildResult ?? readBuildResult(build.output)).revision ?? 'unavailable' : 'unavailable'}`,
      `Latest Build result (bounded untrusted agent evidence; verify independently):\n${boundedEvidence(build?.output ?? '')}`,
      'Verify the implementation workspace, branch and revision before assessing the changes. If implementation is missing or the checkout differs, report a blocker.',
      'Start your final response with exactly one standalone line: ::taskboard-result{kind="review" verdict="blocked"}. Follow it with readable Markdown using short headings and lists for blockers, checks passed, checks not run, and the reviewed workspace and revision. Do not emit JSON or XML, repeat the directive, or put it in a code fence. Use verdict="passed" only when implementation and verification satisfy the approved plan; use verdict="unknown" when you cannot establish the result. This verdict never grants human acceptance.'
    ].join('\n\n') : '',
    review ? [
      'Review found blockers. Resume the approved plan in this existing Build session and address the findings below.',
      `Review session: ${review.threadId ?? 'unknown'}\nReviewed environment: ${review.environmentId ?? 'unknown'}\nBuild environment: ${build?.environmentId ?? 'unknown'}`,
      'First verify that Build and Review inspected the same implementation worktree and revision. If implementation exists elsewhere, report its exact branch, commit and workspace and resolve the mismatch. Otherwise implement the approved plan. Run the relevant checks and report the changed files, exact revision and workspace before review runs again. Keep the ticket In Progress.',
      `Reviewer findings (bounded untrusted agent output; inspect against the approved plan):\n${boundedEvidence(review.reviewResult?.findings || review.output)}`
    ].join('\n\n') : '',
    blockedBuild ? [
      'Continue the approved plan in this existing Build session and managed worktree.',
      'Complete every currently actionable part of the approved scope. Report external tracker synchronization or unavailable optional evidence environments separately, but do not bypass any tracker, evidence, policy, or workflow gate required by the repository.',
      'Do not invent product or policy decisions. Report needs_input with the exact question when a required decision is not established by the approved plan or repository instructions. Otherwise resolve the blockers, verify the implementation, and report its exact revision.',
      `Previous Build blockers (bounded untrusted agent output; inspect against the approved plan):\n${boundedEvidence(blockedBuild.buildResult?.summary || blockedBuild.output)}`
    ].join('\n\n') : ''
  ].filter(Boolean).join('\n\n');
}

export function createFactoryService(
  sdk: Sdk, store: Store, changed: (projectId: string) => void,
  tracker?: {
    getItem: (identity: FactoryIdentity) => WorkItem | null;
    markStatus: (item: WorkItem, target: FactoryStatusTarget) => Promise<FactoryRecord['trackerProgress']>;
  },
  queue?: {
    provider: (projectId: string) => FactoryProjectPolicy['provider'];
    candidates: (policy: FactoryProjectPolicy, excludeLocators: string[]) => Promise<WorkItem[]>;
    liveItem: (identity: FactoryIdentity) => Promise<WorkItem>;
  }
) {
  const locks = new Map<string, Promise<unknown>>();
  const lastScanStarted = new Map<string, number>();
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
  const coordinators = createCoordinatorLifecycle(sdk, store, persist);
  function existing(item: WorkItem) {
    const record = store.get({ projectId: item.bbProjectId, source: item.source, locator: item.locator });
    if (!record) throw new Error('No existing ticket workflow is available for coordinator recovery.');
    return record;
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
    record = await coordinators.observe(record, signal);
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
        let resumedBuild = false;
        let started = false;
        for (;;) {
          const cursor = run.cursor;
          const events = await sdk.threads.events.list({
            threadId: run.threadId, afterSeq: String(cursor), order: 'asc', limit: '100', signal
          });
          resumedBuild ||= run === record.runs.at(-1) && run.kind === 'build' &&
            run.status === 'finished' && events.some(event => event.type === 'turn/started' && event.seq > cursor);
          for (const event of events) {
            applyNativeEvent(run, event);
            if (event.type === 'turn/started') {
              started = true;
            }
          }
          if (events.length < 100 || run.cursor <= cursor) break;
        }
        const thread = await sdk.threads.get({ threadId: run.threadId, signal });
        if (thread.projectId !== record.projectId) throw new Error('Linked thread belongs to another project.');
        if (record.coordinator?.status === 'ready' && !legacyRun(record, run) &&
          thread.parentThreadId !== record.coordinator.threadId) {
          throw new Error('Linked native session has a different coordinator. Restore its original parent before continuing.');
        }
        if (run.environmentId && run.environmentId !== thread.environmentId) {
          throw new Error('Linked native session changed workspace. Restore the implementation environment before continuing.');
        }
        run.environmentId = thread.environmentId;
        const active = ['active', 'starting', 'stopping'].includes(thread.status);
        if (active && !run.pendingCompletion && ['finished', 'failed', 'canceled'].includes(run.status)) {
          resetTurn(run, null);
          started = true;
        }
        if (active && started && !run.pendingCompletion) {
          resumedBuild ||= run === record.runs.at(-1) && run.kind === 'build';
        }
        if (run.environmentId && (!run.hostId || !run.checkoutRoot)) {
          try {
            const workspace = await sdk.environments.get({ environmentId: run.environmentId });
            if (workspace.projectId === record.projectId && workspace.hostId && workspace.path) {
              run.hostId = workspace.hostId;
              run.checkoutRoot = workspace.path;
            }
          } catch {
            // Keep the native session linked while its environment is temporarily unavailable.
          }
        }
        if (resumedBuild && record.automationError?.startsWith('Automatic work paused: Build ') &&
          run.planDigest === record.approvedDigest && run.scopeDigest === record.scopeDigest) {
          record.automationError = null;
          dirty = true;
        }
        // Archiving a completed conversation does not invalidate its result.
        if (thread.archivedAt && !thread.deletedAt && thread.status === 'idle' &&
          run.status === 'failed' && run.error === unavailableSession && run.finishedAt && run.output) {
          run.status = 'finished';
          run.error = null;
        }
        if (thread.status === 'error' || thread.deletedAt || (thread.archivedAt && run.status !== 'finished')) {
          run.status = 'failed';
          run.error = unavailableSession;
        } else if (active) {
          run.status = 'running';
          if (thread.status === 'stopping') run.activity = 'Stopping agent';
          else if (run.pendingCompletion) run.activity = run.pendingCompletion.activity;
          else if (!run.activity) run.activity = 'Agent working';
        } else if (run.pendingCompletion) {
          run.status = run.pendingCompletion.status;
          run.activity = run.pendingCompletion.activity;
          run.pendingCompletion = null;
        } else if (run.status === 'running' && run.finishedAt) {
          run.status = 'finished';
          run.activity = 'Turn finished; work not accepted';
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
    if (!tracker || !record.runs.some(run => run.threadId && ['running', 'finished'].includes(run.status))) return record;
    const target = trackerTarget(record);
    if (record.trackerProgress.target === target && record.trackerProgress.status !== 'pending') return record;
    try {
      record.trackerProgress = await withTimeout(tracker.markStatus(item, target), STATUS_SYNC_TIMEOUT_MS, 'Tracker status update');
    } catch (error) {
      record.trackerProgress = {
        status: 'failed',
        message: `Could not move issue to ${statusTargetLabel(target)}: ${message(error)}`,
        target
      };
    }
    return persist(record);
  }
  async function advance(item: WorkItem | null, record: FactoryRecord, signal?: AbortSignal, restoreArchived = false, automaticDispatch = true, syncProvider = true) {
    if (item && syncProvider) record = await syncProgress(item, record);
    const run = record.runs.at(-1);
    if (!record.automatic || record.automationError || !run || run.status !== 'finished' ||
      run.error || signal?.aborted || record.runs.some(candidate =>
        ['starting', 'running', 'uncertain'].includes(candidate.status))) return record;
    if (run.kind === 'review' && run.reviewResult?.verdict !== 'blocked') return record;
    if (record.admission.kind === 'factory') {
      const policy = store.getProjectPolicy(record.projectId, record.source);
      if (automaticDispatch && !policy.enabled) return record;
      try {
        if (!queue || policy.provider !== record.source || queue.provider(record.projectId) !== record.source) {
          throw new Error('Project provider changed. Save factory settings before continuing.');
        }
        item = await queue.liveItem(record);
        if (item.bbProjectId !== record.projectId || item.source !== record.source ||
          item.locator !== record.locator || ['done', 'canceled'].includes(item.stateCategory) ||
          scopeDigest(item) !== record.scopeDigest) {
          throw new Error('Issue scope or status changed. Inspect the ticket before continuing.');
        }
      } catch (error) {
        record.automationError = `Automatic work paused: ${message(error)}`;
        return persist(record);
      }
    }
    if (!item) return record;
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
      if (run.kind === 'review') return run.reviewResult?.verdict === 'blocked'
        ? await repairReview(item, record, restoreArchived, automaticDispatch) : record;
      if (run.kind === 'build' && run.buildResult?.verdict === 'blocked') {
        if (!run.buildResult.summary.trim()) throw new Error('Build reported no actionable findings. Inspect its result before continuing.');
        const continuations = record.runs.filter(candidate => candidate.kind === 'build' && candidate.continuationOf &&
          candidate.planDigest === record.approvedDigest && candidate.scopeDigest === record.scopeDigest).length;
        if (continuations >= MAX_AUTOMATIC_BUILD_CONTINUATIONS) {
          record.automationError = `Automatic work paused: Build continuation limit reached (${MAX_AUTOMATIC_BUILD_CONTINUATIONS} attempts). Continue manually in the original Build session.`;
          return persist(record);
        }
        return await resumeBlockedBuild(item, record, restoreArchived, automaticDispatch);
      }
      if (run.kind === 'build' && run.buildResult?.verdict !== 'implemented') {
        record.automationError = run.buildResult?.verdict === 'needs_input'
          ? `Automatic work paused: Build needs input: ${run.buildResult.summary.slice(0, 1000)}`
          : 'Automatic work paused: Build did not report a verified implementation revision. Inspect the Build result before continuing.';
        return persist(record);
      }
      return await dispatch(item, record, {
        kind: run.kind === 'investigate' ? 'plan' : run.kind === 'build' ? 'review' : 'build',
        contextThreadId: null, retry: false, automaticDispatch
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
  async function repairReview(item: WorkItem, record: FactoryRecord, restoreArchived = false, automaticDispatch = false) {
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
    return dispatch(item, record, {
      kind: 'build', contextThreadId: null, retry: false, repairOf: review.id, restoreArchived, automaticDispatch
    });
  }
  async function resumeBlockedBuild(item: WorkItem, record: FactoryRecord, restoreArchived = false, automaticDispatch = false) {
    const blocked = record.runs.at(-1)!;
    if (['done', 'canceled'].includes(item.stateCategory)) throw new Error('Reopen the issue before starting more work.');
    if (blocked.planDigest !== record.approvedDigest || blocked.scopeDigest !== record.scopeDigest) {
      throw new Error('Build blockers are stale. Approve the current plan before continuing.');
    }
    record.automatic = true;
    record.automationError = null;
    return dispatch(item, record, {
      kind: 'build', contextThreadId: null, retry: false, continuationOf: blocked.id, restoreArchived, automaticDispatch
    });
  }
  async function dispatch(item: WorkItem, record: FactoryRecord, input: {
    kind: FactoryRunKind; contextThreadId: string | null; retry: boolean; repairOf?: string; continuationOf?: string;
    restoreArchived?: boolean;
    automaticDispatch?: boolean;
  }) {
    const linked = [...record.runs].reverse().filter(run => run.threadId);
    const build = linked.find(run => run.kind === 'build');
    const investigation = linked.find(run => run.kind === 'investigate' && run.status === 'finished' &&
      run.scopeDigest === record.scopeDigest && !run.error && run.output.trim());
    const author = input.kind === 'review' || input.repairOf || input.continuationOf ? build
      : input.kind === 'build' ? build ?? linked.find(run => run.kind === 'plan')
      : input.kind === 'plan' ? investigation
      : input.retry ? linked.find(run => run.kind === 'investigate') : undefined;
    if (input.kind === 'plan' && !investigation) {
      throw new Error('Complete investigation of the current issue scope before generating a plan.');
    }
    const contextId = author?.threadId ?? input.contextThreadId;
    const context = contextId ? await sdk.threads.get({ threadId: contextId }) : null;
    if (context && context.projectId !== item.bbProjectId) throw new Error('Select a thread in this ticket project.');
    if (context?.deletedAt) throw new Error('The original authoring session was deleted. Restore it before continuing.');
    if (author && record.coordinator?.status === 'ready' && !legacyRun(record, author) &&
      context?.parentThreadId !== record.coordinator.threadId) {
      throw new Error('The original stage session has a different coordinator. Restore its parent before continuing.');
    }
    const restoreArchived = context?.archivedAt && input.restoreArchived && (input.repairOf || input.continuationOf);
    if (context?.archivedAt && !restoreArchived) {
      throw new Error('The original authoring session is archived. Use Return to Build with findings or Start task to resume it.');
    }
    if (author && context?.status !== 'idle') throw new SessionBusyError('Stop or finish the preceding session first.');
    const policy = store.getProjectPolicy(item.bbProjectId, item.source);
    const selected = record.execution ?? policy.execution;
    const defaults = selected ? null : context
      ? await sdk.threads.defaultExecutionOptions({ threadId: context.id }).then(value =>
          value ? threadExecution(context.providerId, value) : null)
      : await sdk.projects.defaultExecutionOptions({ projectId: item.bbProjectId });
    const executionArgs = executionForDispatch(selected, defaults);
    const environment = context?.environmentId
      ? await sdk.environments.get({ environmentId: context.environmentId }) : null;
    const recovery = !!(input.repairOf || input.continuationOf);
    const isolateBuild = input.kind === 'build' && !build;
    if (recovery && (!author?.threadId || author.kind !== 'build' ||
      (input.continuationOf && author.id !== input.continuationOf) || author.environmentId !== context?.environmentId)) {
      throw new Error('Build continuation requires the original Build session and managed worktree. Restore that workspace before continuing.');
    }
    if ((recovery || input.kind === 'review' || (input.kind === 'build' && build)) &&
      (!environment || environment.projectId !== record.projectId ||
      environment.status !== 'ready' || !environment.managed || !environment.isWorktree)) {
      throw new Error('The original Build worktree is unavailable. Restore that workspace before continuing.');
    }
    if (input.kind === 'review' && (!environment || author?.kind !== 'build' ||
      author.environmentId !== environment.id)) {
      throw new Error('Review requires the current Build workspace. Restore the linked implementation environment first.');
    }
    if (isolateBuild && (!author?.threadId || !environment)) {
      throw new Error('Build requires a linked native planning session and environment.');
    }
    const reuse = recovery && author?.threadId;
    const events = reuse
      ? await sdk.threads.events.list({ threadId: reuse, order: 'desc', limit: '1' }) : [];
    // Keep a failed restoration out of the caller's durable pause record.
    const draftRecord = structuredClone(record);
    const draft = startRun(draftRecord, input.kind, input.retry);
    draft.repairOf = input.repairOf ?? null;
    draft.continuationOf = input.continuationOf ?? null;
    if (reuse) {
      draft.threadId = reuse;
      draft.environmentId = context!.environmentId;
      draft.hostId = environment?.hostId ?? null;
      draft.checkoutRoot = environment?.path ?? null;
      draft.cursor = events[0]?.seq ?? 0;
    }
    if (restoreArchived) {
      await sdk.threads.unarchive({ threadId: context!.id });
      // Unarchive can race an external move, deletion or native turn.
      const restored = await sdk.threads.get({ threadId: context!.id });
      const workspace = await sdk.environments.get({ environmentId: environment!.id });
      if (restored.deletedAt || restored.archivedAt || restored.projectId !== record.projectId ||
        restored.environmentId !== environment!.id || workspace.projectId !== record.projectId ||
        workspace.status !== 'ready' || !workspace.managed || !workspace.isWorktree) {
        throw new Error('The original Build session or worktree changed during restoration. Inspect it before continuing.');
      }
      if (restored.status !== 'idle') throw new SessionBusyError('Stop or finish the authoring session first.');
    }
    const id = draft.id;
    if (input.automaticDispatch && record.admission.kind === 'factory') {
      const policy = store.getProjectPolicy(record.projectId, record.source);
      if (!policy.enabled) return record;
      if (!queue || policy.provider !== record.source || queue.provider(record.projectId) !== record.source) {
        throw new Error('Project provider changed before dispatch.');
      }
    }
    try {
      record = await coordinators.ensure(item, record);
    } catch (error) {
      if (error instanceof CoordinatorIntentConflict) return store.get(record)!;
      throw error;
    }
    if (record.coordinator && record.coordinator.status !== 'ready') return record;
    if (record.coordinator?.error) return record;
    if (input.automaticDispatch && record.admission.kind === 'factory') {
      const policy = store.getProjectPolicy(record.projectId, record.source);
      if (!policy.enabled) return record;
      if (!queue || policy.provider !== record.source || queue.provider(record.projectId) !== record.source) {
        throw new Error('Project provider changed before dispatch.');
      }
      const live = await queue.liveItem(record);
      if (live.bbProjectId !== record.projectId || live.source !== record.source || live.locator !== record.locator ||
        ['done', 'canceled'].includes(live.stateCategory) || scopeDigest(live) !== record.scopeDigest ||
        !record.runs.length && live.stateCategory !== 'todo') {
        throw new Error('Issue scope or status changed before stage dispatch.');
      }
    }
    draftRecord.version = record.version;
    draftRecord.coordinator = record.coordinator;
    try {
      record = persist(draftRecord);
    } catch (error) {
      const winner = store.get(record);
      if (winner && winner.version !== record.version) return winner;
      throw error;
    }
    const run = record.runs.find(run => run.id === id)!;
    try {
      const prompt = factoryPrompt(item, record, input.kind);
      if (reuse) {
        await sdk.threads.send({
          threadId: reuse, input: [{ type: 'text', text: prompt, mentions: [] }], mode: 'start'
        });
      } else {
        const thread = await sdk.threads.spawn({
          ...executionArgs,
          projectId: item.bbProjectId,
          ...(record.coordinator?.status === 'ready' ? { parentThreadId: record.coordinator.threadId } : {}),
          environment: (input.kind === 'review' || input.kind === 'plan' || (input.kind === 'build' && build)) && environment
            ? { type: 'reuse', environmentId: environment.id }
            : isolateBuild && environment
              ? { type: 'host', hostId: environment.hostId,
                  workspace: { type: 'managed-worktree', baseBranch: { kind: 'default' } } }
              : { type: 'project-default' },
          title: `${item.key}: ${input.kind}`,
          prompt
        });
        run.threadId = thread.id;
        run.environmentId = thread.environmentId;
        try {
          const workspace = thread.environmentId
            ? await sdk.environments.get({ environmentId: thread.environmentId }) : null;
          if (workspace?.projectId === record.projectId) {
            run.hostId = workspace.hostId;
            run.checkoutRoot = workspace.path ?? null;
          }
        } catch {
          // The session was dispatched; a later observation can resolve its workspace.
        }
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
    async scan(projectId?: string): Promise<void> {
      if (!queue) throw new Error('Factory provider access is unavailable.');
      for (const policy of store.projectPolicies().filter(candidate =>
        candidate.enabled && (!projectId || candidate.projectId === projectId))) {
        const now = Date.now();
        if (!projectId && now - (lastScanStarted.get(policy.projectId) ?? -Infinity) < 30_000) continue;
        lastScanStarted.set(policy.projectId, now);
        try {
          if (queue.provider(policy.projectId) !== policy.provider) {
            throw new Error('Project provider changed. Save factory settings before continuing.');
          }
          const excludeLocators = store.all().filter(record =>
            record.projectId === policy.projectId && record.source === policy.provider
          ).map(record => record.locator);
          const candidates = await queue.candidates(policy, excludeLocators);
          const unclaimed = candidates.filter(candidate => candidate.bbProjectId === policy.projectId &&
            candidate.source === policy.provider && candidate.stateCategory === 'todo' && !store.get({
              projectId: candidate.bbProjectId, source: candidate.source, locator: candidate.locator
            }));
          for (const candidate of unclaimed.slice(0, 500)) {
            const identity = { projectId: candidate.bbProjectId, source: candidate.source, locator: candidate.locator };
            const item = await queue.liveItem(identity);
            if (item.bbProjectId !== policy.projectId || item.source !== policy.provider ||
              item.locator !== candidate.locator || item.stateCategory !== 'todo') continue;
            const result = await this.admit(item, policy);
            if ('kind' in result && (result.kind === 'capacity' || result.kind === 'disabled')) break;
          }
          const pendingCandidates = candidates.filter(candidate => !store.get({
            projectId: candidate.bbProjectId, source: candidate.source, locator: candidate.locator
          })).length;
          store.saveScan({ projectId: policy.projectId, observedAt: new Date().toISOString(),
            kind: 'success', reason: null, candidates: candidates.length, pendingCandidates });
        } catch (error) {
          store.saveScan({ projectId: policy.projectId, observedAt: new Date().toISOString(),
            kind: 'blocked', reason: message(error), candidates: 0, pendingCandidates: null });
        }
        changed(policy.projectId);
      }
    },
    async admit(item: WorkItem, policy: FactoryProjectPolicy) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const result = store.admit({
          projectId: item.bbProjectId, source: item.source, locator: item.locator,
          scopeDigest: scopeDigest(item)
        }, policy);
        if (result.kind !== 'admitted') return result;
        const record = result.record;
        return dispatch(item, record, { kind: 'investigate', contextThreadId: null, retry: false, automaticDispatch: true });
      });
    },
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
      const identity = { projectId: item.bbProjectId, source: item.source, locator: item.locator };
      return locked(identity, async () => {
        const saved = store.get(identity);
        const record = saved?.admission.kind === 'factory' ? saved : current(item);
        // Keep the detail read fast. Provider writes happen in the background poll,
        // stage dispatch, or an explicit status retry, not while opening a ticket.
        return advance(item, await reconcile(record, signal), signal, false, true, false);
      });
    },
    async startTask(item: WorkItem, contextThreadId: string | null, execution?: FactoryRecord['execution']) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        let record = await reconcile(current(item));
        if (execution === null && contextThreadId) {
          try {
            const context = await sdk.threads.get({ threadId: contextThreadId });
            const defaults = context.projectId === item.bbProjectId && !context.deletedAt && !context.archivedAt
              ? await sdk.threads.defaultExecutionOptions({ threadId: context.id })
              : null;
            record.execution = defaults ? threadExecution(context.providerId, defaults) : null;
          } catch {
            record.execution = null;
          }
        } else if (execution !== undefined) record.execution = execution;
        const run = record.runs.at(-1);
        if (record.runs.some(candidate => ['starting', 'running', 'uncertain'].includes(candidate.status))) {
          return syncProgress(item, record);
        }
        if (run?.error?.startsWith('Could not read native session:')) return record;
        if (run?.status === 'finished' && ['build', 'review'].includes(run.kind)) {
          if (run.kind === 'build' && (run.buildResult ?? readBuildResult(run.output)).verdict === 'blocked') {
            return resumeBlockedBuild(item, record, true);
          }
          if ((run.kind === 'review' && run.reviewResult?.verdict === 'blocked') || run.repairOf || run.continuationOf) {
            record.automatic = true;
            record.automationError = null;
            return advance(item, persist(record), undefined, true, false);
          }
          return record;
        }
        if (['done', 'canceled'].includes(item.stateCategory)) throw new Error('Reopen the issue before starting a task.');
        record.automatic = true;
        record.automationError = null;
        try {
          record = persist(record);
        } catch (error) {
          const winner = store.get(record);
          if (winner && winner.version !== record.version) return winner;
          throw error;
        }
        if (run?.scopeDigest && run.scopeDigest !== record.scopeDigest) {
          return dispatch(item, record, { kind: 'investigate', contextThreadId, retry: false });
        }
        if (!run || ['failed', 'canceled'].includes(run.status)) {
          return dispatch(item, record, { kind: run?.kind ?? 'investigate', contextThreadId, retry: !!run });
        }
        if (run.kind === 'plan' && !run.output.trim()) {
          return dispatch(item, record, { kind: 'plan', contextThreadId, retry: false });
        }
        return advance(item, record, undefined, false, false);
      });
    },
    async retryStatus(item: WorkItem) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const record = current(item);
        record.trackerProgress = { ...record.trackerProgress, status: 'pending', message: null };
        return syncProgress(item, persist(record));
      });
    },
    forThread: (threadId: string) => store.forThread(threadId),
    async adoptCoordinator(item: WorkItem, expectedVersion: number) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        let record = existing(item);
        if (record.coordinator?.status === 'ready') return coordinators.observe(record);
        assertVersion(record, expectedVersion);
        if (record.coordinator) return record;
        record.coordinator = { status: 'pending' };
        record = persist(record);
        return coordinators.ensure(item, record);
      });
    },
    async retryCoordinator(item: WorkItem, expectedVersion: number, intentId: string) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        let record = existing(item);
        assertVersion(record, expectedVersion);
        if (record.coordinator?.status !== 'failed' || record.coordinator.intentId !== intentId) {
          throw new Error('Only the current confirmed coordinator rejection can be retried.');
        }
        record.coordinator = { status: 'pending' };
        record = persist(record);
        return coordinators.ensure(item, record);
      });
    },
    async recoverCoordinator(item: WorkItem, expectedVersion: number, intentId: string, threadId: string) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const record = existing(item);
        assertVersion(record, expectedVersion);
        return coordinators.recover(item, record, intentId, threadId);
      });
    },
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
        if (record.coordinator?.status === 'ready' && !legacyRun(record, run) &&
          thread.parentThreadId !== record.coordinator.threadId) {
          throw new Error('Recovered session must be a child of this ticket coordinator.');
        }
        if (!run.threadId && (thread.title !== `${item.key}: ${run.kind}` ||
          thread.createdAt < Date.parse(run.startedAt) - 5000)) {
          throw new Error('This thread does not match the uncertain dispatch title and creation time.');
        }
        run.threadId = thread.id;
        run.environmentId = thread.environmentId;
        try {
          const workspace = thread.environmentId
            ? await sdk.environments.get({ environmentId: thread.environmentId }) : null;
          if (workspace?.projectId === record.projectId) {
            run.hostId = workspace.hostId;
            run.checkoutRoot = workspace.path ?? null;
          }
        } catch {
          // The recovered thread is authoritative; its workspace can resolve on the next observation.
        }
        run.status = 'running';
        run.error = null;
        return reconcile(persist(record));
      });
    },
    async setExecution(item: WorkItem, expectedVersion: number, execution: FactoryRecord['execution']) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        const record = current(item);
        assertVersion(record, expectedVersion);
        record.execution = execution;
        return persist(record);
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
        const requested = current(item);
        const record = await reconcile(structuredClone(requested));
        const last = record.runs.at(-1);
        // A stale duplicate button press returns the original dispatch, never spawns.
        if (last && last.kind === input.kind && input.expectedVersion < requested.version &&
          last.status !== 'uncertain') return record;
        assertVersion(requested, input.expectedVersion);
        record.automationError = null;
        if (input.kind === 'build' && last?.kind === 'review' && last.status === 'finished') {
          return repairReview(item, record, true);
        }
        return dispatch(item, record, input);
      });
    },
    async recover() {
      for (const record of store.all()) {
        await locked(record, async () => {
          const latest = store.get(record)!;
          let dirty = false;
          if (latest.coordinator?.status === 'starting') {
            latest.coordinator = { ...latest.coordinator, status: 'uncertain',
              error: 'BB restarted during coordinator dispatch. Inspect native threads and link the matching coordinator; no duplicate was started.' };
            dirty = true;
          }
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
          const item = tracker?.getItem(record) ?? null;
          const saved = store.get(record)!;
          let latest = await reconcile(saved.admission.kind === 'manual' && item ? current(item) : saved, signal);
          if (latest.admission.kind === 'factory' && latest.runs.length === 0 &&
            !latest.automationError && !signal.aborted) {
            const policy = store.getProjectPolicy(latest.projectId, latest.source);
            if (policy.enabled) {
              try {
                if (!queue || policy.provider !== latest.source || queue.provider(latest.projectId) !== latest.source) {
                  throw new Error('Project provider changed. Save factory settings before continuing.');
                }
                const live = await queue.liveItem(latest);
                if (live.bbProjectId !== latest.projectId || live.source !== latest.source ||
                  live.locator !== latest.locator || live.stateCategory !== 'todo' ||
                  scopeDigest(live) !== latest.scopeDigest) {
                  throw new Error('Reserved issue changed before dispatch.');
                }
                latest = await dispatch(live, latest, { kind: 'investigate', contextThreadId: null, retry: false, automaticDispatch: true });
              } catch (error) {
                latest.automationError = message(error);
                persist(latest);
              }
            }
          } else if (item && latest.automatic && !latest.runs.length && !latest.automationError &&
            latest.coordinator?.status === 'ready' && !latest.coordinator.error && !signal.aborted) {
            try {
              if (['done', 'canceled'].includes(item.stateCategory)) throw new Error('Issue was closed or canceled before dispatch.');
              await dispatch(item, latest, { kind: 'investigate', contextThreadId: null, retry: false, automaticDispatch: true });
            } catch (error) {
              latest.automationError = message(error);
              persist(latest);
            }
          } else await advance(item, latest, signal);
        });
      }
    }
  };
}
