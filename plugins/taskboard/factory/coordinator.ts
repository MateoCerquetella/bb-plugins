import { randomUUID } from 'node:crypto';
import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { formatWorkItemContext, type WorkItem } from '../contract.js';
import type { FactoryRecord } from './contract.js';
import { factoryKey } from './state.js';
import type { createFactoryStore } from './store.js';
import { dispatchRejection, nativeError } from './native-dispatch.js';

export class CoordinatorIntentConflict extends Error {}

export const coordinatorTitle = (item: WorkItem, intentId: string) =>
  `${item.key}: coordinator [${intentId}]`;

export function createCoordinatorLifecycle(
  sdk: BbPluginApi['sdk'], store: ReturnType<typeof createFactoryStore>,
  persist: (record: FactoryRecord) => FactoryRecord
) {
  async function observe(record: FactoryRecord, signal?: AbortSignal) {
    const coordinator = record.coordinator;
    if (coordinator?.status !== 'ready') return record;
    const before = JSON.stringify(coordinator);
    try {
      const thread = await sdk.threads.get({ threadId: coordinator.threadId, signal });
      coordinator.nativeStatus = thread.status;
      coordinator.error = thread.projectId !== record.projectId
        ? 'Ticket coordinator belongs to another project. Restore its original project before continuing.'
        : thread.deletedAt || thread.archivedAt
          ? 'Ticket coordinator is archived or deleted. Restore the existing native thread before continuing.' : null;
    } catch (error) {
      if (signal?.aborted) throw error;
      coordinator.error = `Could not read ticket coordinator: ${nativeError(error)}. Restore its link before continuing.`;
    }
    return JSON.stringify(coordinator) !== before ? persist(record) : record;
  }

  async function ensure(item: WorkItem, record: FactoryRecord) {
    record = await observe(record);
    if (!record.coordinator || record.coordinator.status !== 'pending') return record;
    const defaults = await sdk.projects.defaultExecutionOptions({ projectId: record.projectId });
    if (!defaults) throw new Error('Choose native BB model and execution settings for this project first.');
    const intent = {
      intentId: randomUUID(), startedAt: new Date().toISOString(), legacyRunCount: record.runs.length
    };
    record.coordinator = { status: 'starting', ...intent };
    try {
      record = persist(record);
    } catch (error) {
      const winner = store.get(record);
      if (winner && winner.version !== record.version) throw new CoordinatorIntentConflict('Another owner established the coordinator intent.');
      throw error;
    }
    let thread: Awaited<ReturnType<typeof sdk.threads.spawn>>;
    try {
      thread = await sdk.threads.spawn({
        ...defaults, projectId: record.projectId, environment: { type: 'project-default' },
        title: coordinatorTitle(item, intent.intentId),
        prompt: [
          'This is the stable ticket coordinator conversation for the Taskboard factory.',
          'The Taskboard service owns stage dispatch and progress. Investigation, planning, Build, and Review run in child sessions.',
          'Acknowledge the ticket briefly. Do not edit the repository, dispatch agents, change provider status, or claim completion.',
          formatWorkItemContext(item)
        ].join('\n\n')
      });
    } catch (error) {
      const detail = nativeError(error);
      const rejection = dispatchRejection(detail);
      record.coordinator = rejection
        ? { status: 'failed', ...intent, error: rejection }
        : { status: 'uncertain', ...intent,
            error: `Coordinator dispatch outcome uncertain: ${detail}. Inspect native threads and link the matching coordinator; no automatic retry.` };
      return persist(record);
    }
    record.coordinator = {
      status: 'ready', ...intent, threadId: thread.id, nativeStatus: thread.status, error: null
    };
    // A save failure leaves the starting intent durable; only explicit recovery may link the root.
    return persist(record);
  }

  async function recover(item: WorkItem, record: FactoryRecord, intentId: string, threadId: string) {
    const coordinator = record.coordinator;
    if (coordinator?.status === 'ready' && coordinator.intentId === intentId && coordinator.threadId === threadId) {
      return observe(record);
    }
    if (coordinator?.status !== 'uncertain' || coordinator.intentId !== intentId) {
      throw new Error('Only the current uncertain coordinator intent can be recovered.');
    }
    const thread = await sdk.threads.get({ threadId });
    if (thread.projectId !== record.projectId || thread.deletedAt || thread.archivedAt ||
      thread.title !== coordinatorTitle(item, intentId) ||
      thread.createdAt < Date.parse(coordinator.startedAt) - 5000 || thread.createdAt > Date.now() + 5000) {
      throw new Error('Choose the available coordinator thread matching this ticket, intent marker, and creation time.');
    }
    const owner = store.forThread(threadId);
    if (owner && factoryKey(owner) !== factoryKey(record)) throw new Error('Thread belongs to another work item.');
    record.coordinator = {
      status: 'ready', intentId, startedAt: coordinator.startedAt,
      legacyRunCount: coordinator.legacyRunCount, threadId, nativeStatus: thread.status, error: null
    };
    return persist(record);
  }
  return { ensure, observe, recover };
}
