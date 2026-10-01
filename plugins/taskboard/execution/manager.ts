import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import type { ExecutionEngine } from './engine.js';
import type {
  ExecutionConfig,
  ExecutionRequest,
  ExecutionRun,
  RuntimeEvent
} from './contract.js';
import type { ExecutionStore } from './store.js';
import { requestDigest, selectEngine } from './request.js';

export const eligible = new Set(['queued', 'running', 'retrying']);
const terminal = new Set(['verified', 'canceled', 'failed']);
export function createExecutionManager(deps: {
  store: ExecutionStore;
  engine: ExecutionEngine;
  config: () => Promise<ExecutionConfig>;
  changed: (run: ExecutionRun) => void;
}) {
  const { store, engine } = deps;
  const locks = new Map<string, Promise<unknown>>();
  async function serial<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    locks.set(id, next);
    try {
      return await next;
    } finally {
      if (locks.get(id) === next) locks.delete(id);
    }
  }
  function required(id: string): ExecutionRun {
    const run = store.get(id);
    if (!run) throw new Error('Unknown execution');
    return run;
  }
  function save(run: ExecutionRun): ExecutionRun {
    const next = store.save(run);
    deps.changed(next);
    return next;
  }
  async function notify(
    run: ExecutionRun,
    action: 'start' | 'stop' | 'resume'
  ) {
    try {
      await engine[action](run);
    } catch {
      return save({
        ...required(run.id),
        lastError:
          'Symphony unavailable; request persisted and will be reconciled. No duplicate run was started.'
      });
    }
    return required(run.id);
  }
  return {
    required,
    serial,
    save,
    async start(
      request: ExecutionRequest,
      digest: string,
      dispatchKey: string,
      parent?: ExecutionRun
    ): Promise<ExecutionRun> {
      return serial('dispatch', async () => {
        const previous = store.byDispatch(dispatchKey);
        if (previous) {
          if (previous.digest !== digest)
            throw new Error(
              'Dispatch key already belongs to a different approved request'
            );
          return previous;
        }
        const config = await deps.config();
        if (
          selectEngine(request.scope.route, 'symphony', config) !== 'symphony'
        )
          throw new Error('Direct work uses local handoff');
        if (digest !== requestDigest(request))
          throw new Error('Approved request changed; review it again');
        if (!isAbsolute(config.workspaceRoot))
          throw new Error(
            'Configure an absolute shared Symphony workspace root'
          );
        const id = `tb_${randomUUID().replaceAll('-', '')}`;
        const run: ExecutionRun = {
          id,
          dispatchKey,
          request,
          digest,
          engine: 'symphony',
          endpoint: config.endpoint,
          runtimeId: config.runtimeId,
          workspace: join(config.workspaceRoot, id),
          state: 'queued',
          generation: 1,
          iteration: (parent?.iteration ?? 0) + 1,
          parentId: parent?.id ?? null,
          feedback: parent
            ? parent.checks
                .filter(check => !check.passed)
                .map(check => `${check.id}: ${check.output}`)
                .join('\n')
                .slice(0, 20_000)
            : '',
          createdAt: new Date().toISOString(),
          generationStartedAt: new Date().toISOString(),
          generationRetryBase: 0,
          startedAt: null,
          endedAt: null,
          retryCount: 0,
          lastError: null,
          agent: 'Codex',
          runId: null,
          head: null,
          pr: null,
          runtimeReleased: false,
          verificationAttempted: false,
          checks: parent?.checks ?? [],
          verifiedHead: null,
          acceptanceReviewed: false,
          version: 0
        };
        try {
          if (parent) store.insertFix(run, parent);
          else store.insert(run);
        } catch (error) {
          if (String(error).includes('UNIQUE'))
            throw new Error(
              'This task already has an active execution; open its status'
            );
          throw error;
        }
        deps.changed(run);
        return notify(run, 'start');
      });
    },
    async stop(id: string) {
      return serial(id, async () => {
        const run = required(id);
        if (terminal.has(run.state)) return run;
        return notify(
          save({
            ...run,
            state: 'canceling',
            acceptanceReviewed: false,
            verifiedHead: null
          }),
          'stop'
        );
      });
    },
    async resume(id: string) {
      return serial(id, async () => {
        const run = required(id);
        if (!['blocked', 'failed', 'canceled'].includes(run.state))
          throw new Error('Only stopped or blocked executions can resume');
        const status = await engine.getStatus(run);
        if (status.state !== 'untracked')
          throw new Error(
            'Runtime still holds the previous attempt; wait for reconciliation'
          );
        const config = await deps.config();
        if (
          !config.enabled ||
          config.runtimeId !== run.runtimeId ||
          config.endpoint !== run.endpoint
        )
          throw new Error(
            'Restore this execution’s runtime configuration before resuming'
          );
        return notify(
          save({
            ...run,
            state: 'queued',
            generation: run.generation + 1,
            generationStartedAt: new Date().toISOString(),
            generationRetryBase: run.retryCount,
            endedAt: null,
            lastError: null,
            runtimeReleased: false,
            verificationAttempted: false,
            verifiedHead: null,
            acceptanceReviewed: false
          }),
          'resume'
        );
      });
    },
    async report(id: string, event: RuntimeEvent) {
      return serial(id, async () => {
        const next = store.event(id, event.eventId, event, run => {
          if (
            event.generation !== run.generation ||
            terminal.has(run.state) ||
            run.state === 'verifying'
          )
            return run;
          if (run.state === 'canceling' && event.state !== 'canceled')
            return run;
          if (
            run.state === 'implementation_complete' &&
            !['canceled', 'failed'].includes(event.state)
          )
            return run;
          if (event.state === 'implementation_complete' && !event.head)
            throw new Error(
              'Implementation handoff requires a committed revision'
            );
          return {
            ...run,
            state: event.state,
            retryCount: Math.max(run.retryCount, event.retryCount),
            lastError: event.error,
            head: event.head ?? run.head,
            pr: event.pr ?? run.pr,
            agent: event.agent,
            runId: event.runId ?? run.runId,
            startedAt: run.startedAt ?? new Date().toISOString(),
            endedAt: ['failed', 'canceled', 'implementation_complete'].includes(
              event.state
            )
              ? new Date().toISOString()
              : null,
            runtimeReleased: false
          };
        });
        deps.changed(next);
        return next;
      });
    },
    async reconcile(id: string) {
      return serial(id, async () => {
        const run = required(id);
        if (run.state === 'verified') return run;
        try {
          const status = await engine.getStatus(run);
          if (status.state === 'untracked') {
            if (run.state === 'canceling')
              return save({
                ...run,
                state: 'canceled',
                runtimeReleased: true,
                endedAt: new Date().toISOString(),
                lastError: null
              });
            if (
              ['implementation_complete', 'failed', 'canceled'].includes(
                run.state
              )
            )
              return run.runtimeReleased
                ? run
                : save({ ...run, runtimeReleased: true });
            // Absence from an in-memory snapshot never proves success or failure.
            return run;
          }
          if (!eligible.has(run.state)) return run;
          if (
            run.state === status.state &&
            run.retryCount >= status.retries &&
            (status.runId === null || status.runId === run.runId) &&
            run.lastError === status.error
          )
            return run;
          return save({
            ...run,
            state: status.state === 'blocked' ? 'blocked' : status.state,
            retryCount: Math.max(run.retryCount, status.retries),
            runId: status.runId ?? run.runId,
            lastError: status.error,
            startedAt: run.startedAt ?? new Date().toISOString()
          });
        } catch {
          return save({
            ...run,
            lastError:
              'Symphony unavailable; runtime outcome is unknown. Reconciliation will retry.'
          });
        }
      });
    }
  };
}
export type ExecutionManager = ReturnType<typeof createExecutionManager>;
