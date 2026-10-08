import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { formatWorkItemContext, type WorkItem } from '../contract.js';
import type { FactoryIdentity, FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';
import { approvePlan, assertVersion, factoryKey, newRecord, savePlan, scopeDigest, startRun } from './state.js';
import type { createFactoryStore } from './store.js';

type Store = ReturnType<typeof createFactoryStore>;
type Sdk = BbPluginApi['sdk'];
type Event = Awaited<ReturnType<Sdk['threads']['events']['list']>>[number];
const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1000);
function dispatchRejection(value: string) {
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
    kind === 'review' ? `Authoring session: ${record.runs.find(run => run.kind === 'build')?.threadId ?? ''}` : ''
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
        run.environmentId = thread.environmentId;
        const events = await sdk.threads.events.list({
          threadId: run.threadId, afterSeq: String(run.cursor), order: 'asc', limit: '100', signal
        });
        for (const event of events) applyNativeEvent(run, event);
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
          run.output = (output ?? '').slice(0, 100_000);
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
      run.error || signal?.aborted || !['investigate', 'plan'].includes(run.kind)) return record;
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
      return await dispatch(item, record, {
        kind: run.kind === 'investigate' ? 'plan' : 'build', contextThreadId: null, retry: false
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
  async function dispatch(item: WorkItem, record: FactoryRecord, input: {
    kind: FactoryRunKind; contextThreadId: string | null; retry: boolean;
  }) {
    const author = [...record.runs].reverse().find(run => run.kind !== 'review' && run.threadId);
    const contextId = author?.threadId ?? input.contextThreadId;
    const context = contextId ? await sdk.threads.get({ threadId: contextId }) : null;
    if (context && context.projectId !== item.bbProjectId) throw new Error('Select a thread in this ticket project.');
    if (author && context?.status !== 'idle') throw new SessionBusyError('Stop or finish the authoring session first.');
    const defaults = context
      ? await sdk.threads.defaultExecutionOptions({ threadId: context.id })
      : await sdk.projects.defaultExecutionOptions({ projectId: item.bbProjectId });
    if (!defaults) throw new Error('Choose native BB model and execution settings for this project first.');
    const environment = context?.environmentId
      ? await sdk.environments.get({ environmentId: context.environmentId }) : null;
    const isolateBuild = input.kind === 'build' && (!environment?.managed || !environment.isWorktree);
    if (isolateBuild && (!author?.threadId || !environment)) {
      throw new Error('Build requires a linked native planning session and environment.');
    }
    // Project-default investigation can use a plain checkout. Preserve its
    // conversation by forking Build into a managed worktree in one dispatch.
    const reuse = input.kind !== 'review' && !isolateBuild && author?.threadId;
    const events = reuse
      ? await sdk.threads.events.list({ threadId: reuse, order: 'desc', limit: '1' }) : [];
    const draft = startRun(record, input.kind, input.retry);
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
    async get(item: WorkItem, signal?: AbortSignal) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () =>
        advance(item, await reconcile(current(item), signal), signal));
    },
    async startTask(item: WorkItem, contextThreadId: string | null) {
      return locked({ projectId: item.bbProjectId, source: item.source, locator: item.locator }, async () => {
        let record = current(item);
        const run = record.runs.at(-1);
        if (run && ['starting', 'running', 'uncertain'].includes(run.status)) return syncProgress(item, record);
        if (run?.status === 'finished' && ['build', 'review'].includes(run.kind)) return record;
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
