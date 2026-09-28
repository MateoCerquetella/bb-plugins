import type Database from 'better-sqlite3';
import {
  agentThreadLinkSchema,
  type AgentThreadLink,
  type AgentThreadState
} from '../contract.js';

export const AGENT_THREAD_MIGRATION = `
  CREATE TABLE taskboard_agent_threads (
    dispatch_key TEXT PRIMARY KEY,
    task_key TEXT NOT NULL,
    thread_id TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (
      state IN ('running', 'completed', 'failed', 'canceled')
    ),
    terminal_event_seq INTEGER,
    data TEXT NOT NULL
  );
  CREATE INDEX taskboard_agent_thread_task
    ON taskboard_agent_threads(task_key);
  CREATE INDEX taskboard_agent_thread_state
    ON taskboard_agent_threads(state);
`;

function taskKey(task: {
  projectId: string;
  source: string;
  locator: string;
}): string {
  return JSON.stringify([task.projectId, task.source, task.locator]);
}

export function agentThreadOutcome(event: {
  seq: number;
  data: {
    status: 'completed' | 'failed' | 'interrupted';
    error?: { message: string };
  };
}): {
  state: Exclude<AgentThreadState, 'running'>;
  terminalEventSeq: number;
  error: string | null;
} {
  return {
    state:
      event.data.status === 'completed'
        ? 'completed'
        : event.data.status === 'interrupted'
          ? 'canceled'
          : 'failed',
    terminalEventSeq: event.seq,
    error:
      event.data.status === 'failed'
        ? (event.data.error?.message ?? 'The agent turn failed')
        : null
  };
}

export function createAgentThreadStore(db: Database.Database) {
  const decode = (row: unknown): AgentThreadLink | null =>
    row
      ? agentThreadLinkSchema.parse(JSON.parse((row as { data: string }).data))
      : null;

  const persist = (link: AgentThreadLink): AgentThreadLink => {
    const parsed = agentThreadLinkSchema.parse(link);
    db.prepare(
      `
        INSERT INTO taskboard_agent_threads (
          dispatch_key, task_key, thread_id, state, terminal_event_seq, data
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(dispatch_key) DO UPDATE SET
          state = excluded.state,
          terminal_event_seq = excluded.terminal_event_seq,
          data = excluded.data
      `
    ).run(
      parsed.dispatchKey,
      taskKey(parsed.task),
      parsed.threadId,
      parsed.state,
      parsed.terminalEventSeq,
      JSON.stringify(parsed)
    );
    return parsed;
  };

  return {
    insert(link: AgentThreadLink): AgentThreadLink {
      const existing = this.byDispatch(link.dispatchKey);
      return existing ?? persist(link);
    },
    byDispatch(dispatchKey: string): AgentThreadLink | null {
      return decode(
        db
          .prepare(
            'SELECT data FROM taskboard_agent_threads WHERE dispatch_key = ?'
          )
          .get(dispatchKey)
      );
    },
    latest(task: AgentThreadLink['task']): AgentThreadLink | null {
      return decode(
        db
          .prepare(
            `
              SELECT data
              FROM taskboard_agent_threads
              WHERE task_key = ?
              ORDER BY rowid DESC
              LIMIT 1
            `
          )
          .get(taskKey(task))
      );
    },
    unresolved(): AgentThreadLink[] {
      return db
        .prepare(
          `
            SELECT data
            FROM taskboard_agent_threads
            WHERE state = 'running'
            ORDER BY rowid
          `
        )
        .all()
        .map(row => decode(row)!);
    },
    transition(
      link: AgentThreadLink,
      input: {
        state: AgentThreadState;
        terminalEventSeq: number | null;
        error: string | null;
        updatedAt?: string;
      }
    ): { changed: boolean; link: AgentThreadLink } {
      if (
        link.state === input.state &&
        link.terminalEventSeq === input.terminalEventSeq &&
        link.error === input.error
      ) {
        return { changed: false, link };
      }
      if (
        link.terminalEventSeq !== null &&
        input.terminalEventSeq !== null &&
        input.terminalEventSeq <= link.terminalEventSeq
      ) {
        return { changed: false, link };
      }
      const next = persist({
        ...link,
        state: input.state,
        terminalEventSeq: input.terminalEventSeq,
        error: input.error?.slice(0, 2000) ?? null,
        updatedAt: input.updatedAt ?? new Date().toISOString()
      });
      return { changed: true, link: next };
    }
  };
}

export type AgentThreadStore = ReturnType<typeof createAgentThreadStore>;
