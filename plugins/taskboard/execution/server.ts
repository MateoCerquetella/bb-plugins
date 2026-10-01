import type { BbPluginApi, PluginRpcHandlers } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import type {
  WorkItemDetail,
  WorkStatusOption,
  taskboardRpcContract
} from '../contract.js';
import {
  executionConfigSchema,
  executionIdSchema,
  runtimeEventSchema,
  type TaskReference
} from './contract.js';
import { createExecutionStore } from './store.js';
import { createExecutionManager, eligible } from './manager.js';
import {
  executionInstructions,
  normalizeExecutionRequest,
  requestDigest,
  selectEngine
} from './request.js';
import { localEngine } from './engines/local/index.js';
import { createSymphonyEngine } from './engines/symphony/index.js';
import { git, inspectWorkspace, verifyExecution } from './verification.js';
import { resolveExecutionDefaults } from './defaults.js';

type Contract = typeof taskboardRpcContract;
type ExecutionHandlers = Pick<
  PluginRpcHandlers<Contract>,
  | 'executionDefaults'
  | 'executionConfig'
  | 'prepareExecution'
  | 'startExecution'
  | 'executionStatus'
  | 'executionAction'
>;

export function registerExecution(
  bb: BbPluginApi,
  deps: {
    getItem: (task: TaskReference) => Promise<WorkItemDetail>;
    assertProject: (id: string) => Promise<void>;
  }
) {
  const settings = bb.settings.define({
    executionEnabled: {
      type: 'boolean',
      label: 'Enable managed execution',
      default: false
    },
    executionDefaultEngine: {
      type: 'select',
      label: 'Default execution engine',
      default: 'local',
      options: ['local', 'symphony']
    },
    symphonyEndpoint: {
      type: 'string',
      label: 'Symphony status endpoint',
      default: 'http://127.0.0.1:4000'
    },
    symphonyRuntimeId: {
      type: 'string',
      label: 'Symphony runtime identity',
      default: 'taskboard'
    },
    symphonyWorkspaceRoot: {
      type: 'string',
      label: 'Shared Symphony workspace root',
      default: ''
    },
    symphonyMaxConcurrency: {
      type: 'string',
      label: 'Symphony concurrency',
      default: '4'
    },
    symphonyMaxRetries: {
      type: 'string',
      label: 'Symphony retry limit',
      default: '3'
    },
    symphonyRunTimeoutMs: {
      type: 'string',
      label: 'Symphony execution timeout (ms)',
      default: '3600000'
    },
    executionMaxFixIterations: {
      type: 'string',
      label: 'Taskboard automatic fix iterations',
      default: '2'
    }
  });
  const config = async () => {
    const value = await settings.get();
    return executionConfigSchema.parse({
      enabled: value.executionEnabled,
      defaultEngine: value.executionDefaultEngine,
      endpoint:
        process.env.TASKBOARD_SYMPHONY_ENDPOINT || value.symphonyEndpoint,
      runtimeId: value.symphonyRuntimeId,
      workspaceRoot:
        process.env.TASKBOARD_SYMPHONY_WORKSPACE_ROOT ||
        value.symphonyWorkspaceRoot,
      maxConcurrency: Number(value.symphonyMaxConcurrency),
      maxRetries: Number(value.symphonyMaxRetries),
      runTimeoutMs: Number(value.symphonyRunTimeoutMs),
      maxFixIterations: Number(value.executionMaxFixIterations)
    });
  };
  const store = createExecutionStore(bb.storage.database());
  const manager = createExecutionManager({
    store,
    engine: createSymphonyEngine(),
    config,
    changed: run =>
      bb.realtime.publish('taskboard:execution-changed', {
        projectId: run.request.task.projectId,
        id: run.id
      })
  });
  const disposal = new AbortController();
  bb.onDispose(() => disposal.abort());
  async function currentItem(task: TaskReference) {
    await deps.assertProject(task.projectId);
    return deps.getItem(task);
  }
  const handlers: ExecutionHandlers = {
    executionConfig: config,
    async executionDefaults(task) {
      const project = await bb.sdk.projects.get({ projectId: task.projectId });
      const source =
        project.sources.find(source => source.isDefault) ?? project.sources[0];
      if (!source) throw new Error('Configure a project repository first');
      // Shared-workspace execution is intentionally limited to repository paths accessible to this server.
      return resolveExecutionDefaults(source.path, {
        initializeRepository: task.initializeRepository
      });
    },
    async prepareExecution(input) {
      const item = await currentItem(input.task);
      const engine = selectEngine(
        input.scope.route,
        input.engine,
        await config()
      );
      const request = normalizeExecutionRequest(item, input.scope);
      return {
        request,
        digest: requestDigest(request),
        engine,
        prompt: localEngine.prepare(item).prompt
      };
    },
    async startExecution(input) {
      const item = await currentItem(input.request.task);
      if (['done', 'canceled'].includes(item.stateCategory))
        throw new Error(
          'Reopen the tracker task before starting implementation'
        );
      const request = normalizeExecutionRequest(item, input.request.scope);
      if (requestDigest(request) !== input.digest)
        throw new Error('Task context changed; review the current request');
      return manager.start(request, input.digest, input.dispatchKey);
    },
    async executionStatus(task) {
      await deps.assertProject(task.projectId);
      return { runs: store.list(task) };
    },
    async executionAction(input) {
      const run = manager.required(input.id);
      await deps.assertProject(run.request.task.projectId);
      if (input.expectedVersion !== run.version)
        throw new Error('Execution changed; refresh before retrying');
      if (input.action === 'stop') return manager.stop(run.id);
      const item = await currentItem(run.request.task);
      if (['done', 'canceled'].includes(item.stateCategory))
        throw new Error('Tracker task is closed or canceled');
      if (input.action === 'resume') return manager.resume(run.id);
      if (input.action === 'fix') {
        if (
          run.state !== 'implementation_complete' ||
          !run.checks.some(check => !check.passed) ||
          !run.runtimeReleased
        )
          throw new Error(
            'A released implementation with failed checks is required'
          );
        // Preserve the original record and keep the linked fix dispatch idempotent.
        const existing = store
          .list(run.request.task)
          .find(entry => entry.parentId === run.id);
        if (existing) return existing;
        return manager.start(run.request, run.digest, `fix:${run.id}`, run);
      }
      return manager.serial(run.id, async () => {
        const current = manager.required(run.id);
        if (
          current.state !== 'implementation_complete' ||
          !current.runtimeReleased
        )
          throw new Error(
            'Wait for implementation completion and workspace release'
          );
        if (input.action === 'accept') {
          if (
            !current.verifiedHead ||
            current.verifiedHead !== current.head ||
            current.checks.length !==
              current.request.scope.verificationRequirements.length ||
            current.checks.some(check => !check.passed)
          )
            throw new Error('Run all required verification checks first');
          await inspectWorkspace(current);
          return manager.save({
            ...current,
            state: 'verified',
            acceptanceReviewed: true,
            lastError: null
          });
        }
        const verifying = manager.save({
          ...current,
          state: 'verifying',
          verificationAttempted: true,
          acceptanceReviewed: false,
          verifiedHead: null
        });
        try {
          const result = await verifyExecution(verifying, disposal.signal);
          if (disposal.signal.aborted) return verifying;
          return manager.save({
            ...manager.required(run.id),
            state: 'implementation_complete',
            checks: result.checks,
            verifiedHead: result.checks.every(check => check.passed)
              ? result.head
              : null,
            lastError: result.checks.every(check => check.passed)
              ? null
              : 'Required checks failed; review a fix execution'
          });
        } catch (error) {
          if (disposal.signal.aborted) return verifying;
          return manager.save({
            ...manager.required(run.id),
            state: 'blocked',
            verifiedHead: null,
            lastError:
              error instanceof Error ? error.message : 'Verification failed'
          });
        }
      });
    }
  };
  const queueInput = z
    .object({
      runtimeId: z.string().min(1),
      ids: z.array(z.string()).optional()
    })
    .strict();
  bb.http.route(
    'POST',
    '/execution/v1/queue',
    async c => {
      const input = queueInput.parse(await c.req.json());
      const cfg = await config();
      const runs = store
        .list()
        .filter(
          run =>
            run.runtimeId === input.runtimeId &&
            (!input.ids || input.ids.includes(run.id))
        );
      if (input.runtimeId !== cfg.runtimeId && runs.length === 0)
        return c.json({ error: 'Unknown runtime' }, 403);
      // Fetch current tracker state before every dispatch/reconciliation, using Taskboard's adapters.
      const result = [];
      for (const entry of runs) {
        let run = entry;
        if (
          eligible.has(run.state) &&
          (!cfg.enabled ||
            run.endpoint !== cfg.endpoint ||
            run.runtimeId !== cfg.runtimeId)
        )
          run = manager.save({
            ...run,
            state: 'canceling',
            lastError:
              'Execution configuration changed; stopping the previous runtime'
          });
        if (eligible.has(run.state)) {
          try {
            const item = await currentItem(run.request.task);
            if (['canceled', 'done'].includes(item.stateCategory))
              run = manager.save({ ...run, state: 'canceling' });
          } catch {
            manager.save({
              ...manager.required(run.id),
              lastError:
                'Tracker state unavailable; execution eligibility cannot be confirmed'
            });
            return c.json(
              {
                error:
                  'Tracker state unavailable; keep the existing runtime state until reconciliation succeeds'
              },
              503
            );
          }
        }
        result.push({
          ...run,
          dispatchable:
            cfg.enabled &&
            run.endpoint === cfg.endpoint &&
            eligible.has(run.state)
        });
      }
      return c.json({ schemaVersion: 1, configuration: cfg, runs: result });
    },
    { auth: 'token' }
  );
  bb.http.route(
    'POST',
    '/execution/v1/events/:id',
    async c => {
      const event = runtimeEventSchema.parse(await c.req.json());
      const run = await manager.report(
        executionIdSchema.parse(c.req.param('id')),
        event
      );
      return c.json({ id: run.id, state: run.state });
    },
    { auth: 'token' }
  );
  bb.http.route(
    'GET',
    '/execution/v1/context/:id',
    async c => {
      const run = manager.required(executionIdSchema.parse(c.req.param('id')));
      const parent = run.parentId ? manager.required(run.parentId) : null;
      return c.json({
        schemaVersion: 1,
        executionId: run.id,
        generation: run.generation,
        digest: run.digest,
        approvedScope: run.request.scope,
        taskReference: {
          title: run.request.title,
          description: run.request.description,
          metadata: run.request.metadata
        },
        feedback: run.feedback,
        parent: parent
          ? { workspace: parent.workspace, head: parent.head }
          : null,
        instructions: executionInstructions(run.request)
      });
    },
    { auth: 'token' }
  );
  bb.background.service('execution-reconciliation', {
    async start(signal) {
      for (const run of store.list()) {
        if (run.state === 'verifying')
          manager.save({
            ...run,
            state: 'implementation_complete',
            verificationAttempted: false,
            verifiedHead: null,
            lastError:
              'Taskboard restarted during verification; rerun required checks'
          });
      }
      while (!signal.aborted) {
        for (const run of store.list()) {
          if (signal.aborted) break;
          if (
            run.state === 'verified' ||
            (['failed', 'canceled'].includes(run.state) && run.runtimeReleased)
          )
            continue;
          await manager.reconcile(run.id);
        }
        await new Promise<void>(resolve => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, 5000);
          signal.addEventListener('abort', done, { once: true });
          if (signal.aborted) done();
        });
      }
    }
  });
  bb.background.service('execution-verification', {
    async start(signal) {
      while (!signal.aborted) {
        for (const run of store.list()) {
          if (signal.aborted) break;
          if (run.state !== 'implementation_complete' || !run.runtimeReleased)
            continue;
          try {
            const current = run.verificationAttempted
              ? run
              : await handlers.executionAction({
                  id: run.id,
                  action: 'verify',
                  expectedVersion: run.version
                });
            if (
              current.state === 'implementation_complete' &&
              current.checks.some(check => !check.passed) &&
              current.iteration <= (await config()).maxFixIterations
            ) {
              await handlers.executionAction({
                id: current.id,
                action: 'fix',
                expectedVersion: current.version
              });
            }
          } catch {
            /* A concurrent action or tracker outage leaves the durable record for the next sweep. */
          }
        }
        await new Promise<void>(resolve => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, 2000);
          signal.addEventListener('abort', done, { once: true });
          if (signal.aborted) done();
        });
      }
    }
  });
  return {
    handlers,
    hasManagedExecution(task: TaskReference) {
      return store.list(task).length > 0;
    },
    async guardTrackerTransition(
      task: TaskReference,
      target: WorkStatusOption
    ) {
      if (target.stateCategory !== 'done') return;
      const latest = store.list(task)[0];
      if (!latest) return;
      if (
        latest.state !== 'verified' ||
        !latest.acceptanceReviewed ||
        latest.verifiedHead !== latest.head
      )
        throw new Error(
          'Taskboard verification and acceptance review are required before completing this task'
        );
      await inspectWorkspace(latest);
    }
  };
}
