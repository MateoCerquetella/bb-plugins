import type { BbPluginApi } from '@get-bb/plugin-sdk';
import type { z } from 'zod';
import {
  improvementResultSchema, parseTicketImprovement, ticketImprovementPrompt
} from './ticket-improvement.js';

type Identity = { projectId: string; requestId: string };
type Result = z.infer<typeof improvementResultSchema>;
type Record = Result & { threadId: string | null; startedAt: number };
const prefix = 'ticket-improvement:';
const timeout = 5 * 60_000;

export function createTicketImprovementService(bb: Pick<BbPluginApi, 'sdk' | 'storage' | 'log'>) {
  const locks = new Map<string, Promise<unknown>>();
  const key = (input: Identity) => `${prefix}${JSON.stringify([input.projectId, input.requestId])}`;
  async function locked<T>(input: Identity, action: () => Promise<T>): Promise<T> {
    const id = key(input);
    const next = (locks.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
    locks.set(id, next);
    try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
  }
  const read = (input: Identity) => bb.storage.kv.get<Record>(key(input));
  async function save(input: Identity, record: Record) {
    await bb.storage.kv.set(key(input), record);
    return improvementResultSchema.parse({
      status: record.status, draft: record.draft, error: record.error
    });
  }
  async function cleanup(record: Record, stop: boolean) {
    if (!record.threadId) return true;
    try {
      if (stop) await bb.sdk.threads.stop({ threadId: record.threadId });
      await bb.sdk.threads.archive({ threadId: record.threadId });
      record.threadId = null;
      return true;
    } catch {
      bb.log.warn(`Ticket improvement helper cleanup pending: ${record.threadId}`);
      return false;
    }
  }
  return {
    start(input: Identity & { title: string; description: string }) {
      return locked(input, async () => {
        const prior = await read(input);
        if (prior) return save(input, prior);
        const defaults = await bb.sdk.projects.defaultExecutionOptions({ projectId: input.projectId });
        if (!defaults) throw new Error('Choose a default BB provider and model for this project first.');
        const record: Record = {
          status: 'uncertain', draft: null,
          error: 'Helper startup is unconfirmed. Do not retry this request automatically.',
          threadId: null, startedAt: Date.now()
        };
        await save(input, record);
        try {
          const thread = await bb.sdk.threads.spawn({
            ...defaults,
            projectId: input.projectId,
            environment: { type: 'project-default' },
            visibility: 'hidden',
            title: 'Improve ticket draft',
            prompt: ticketImprovementPrompt({ title: input.title, description: input.description })
          });
          record.threadId = thread.id;
          record.status = 'running';
          record.error = null;
          return await save(input, record);
        } catch {
          return save(input, record);
        }
      });
    },
    get(input: Identity) {
      return locked(input, async () => {
        const record = await read(input);
        if (!record) throw new Error('Ticket improvement request not found.');
        if (record.status !== 'running' || !record.threadId) return save(input, record);
        if (Date.now() - record.startedAt > timeout) {
          record.status = 'failed';
          record.error = 'Ticket improvement timed out. Your draft is unchanged.';
          await cleanup(record, true);
          return save(input, record);
        }
        const thread = await bb.sdk.threads.get({ threadId: record.threadId });
        if (thread.projectId !== input.projectId) throw new Error('Helper project mismatch.');
        if (thread.status === 'idle') {
          const { output } = await bb.sdk.threads.output({ threadId: record.threadId });
          if (!output) return save(input, record);
          try {
            record.draft = parseTicketImprovement(output);
            record.status = 'completed';
          } catch {
            record.status = 'failed';
            record.error = 'The helper returned an invalid ticket draft. Your draft is unchanged.';
          }
          await cleanup(record, false);
        } else if (thread.status === 'error' || thread.deletedAt || thread.archivedAt) {
          record.status = 'failed';
          record.error = 'The ticket drafting helper stopped or failed. Your draft is unchanged.';
          await cleanup(record, true);
        }
        return save(input, record);
      });
    },
    cancel(input: Identity) {
      return locked(input, async () => {
        const record = await read(input) ?? {
          status: 'canceled' as const, draft: null, error: null, threadId: null, startedAt: Date.now()
        };
        if (record.status === 'uncertain' && !record.threadId) return save(input, record);
        record.status = 'canceled';
        record.draft = null;
        record.error = null;
        await save(input, record);
        if (!await cleanup(record, true)) {
          record.status = 'uncertain';
          record.error = 'Cancellation could not be confirmed. Your draft is unchanged.';
        }
        return save(input, record);
      });
    },
    async sweep() {
      for (const id of await bb.storage.kv.list(prefix)) {
        const [projectId, requestId] = JSON.parse(id.slice(prefix.length)) as [string, string];
        const input = { projectId, requestId };
        await locked(input, async () => {
          const record = await read(input);
          if (!record) return;
          const expired = Date.now() - record.startedAt > timeout;
          if (expired && record.status === 'running') {
            record.status = 'failed';
            record.error = 'Ticket improvement timed out. Your draft is unchanged.';
          }
          if (record.status !== 'running' && record.threadId) await cleanup(record, true);
          await save(input, record);
          if (!record.threadId && Date.now() - record.startedAt > 24 * 60 * 60_000) {
            await bb.storage.kv.delete(id);
          }
        });
      }
    }
  };
}
