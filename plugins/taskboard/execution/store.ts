import type Database from 'better-sqlite3';
import {
  executionRunSchema,
  type ExecutionRun,
  type TaskReference
} from './contract.js';

export const EXECUTION_MIGRATION = `
  CREATE TABLE taskboard_executions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task_key TEXT NOT NULL,
    dispatch_key TEXT NOT NULL UNIQUE, active_key TEXT UNIQUE,
    version INTEGER NOT NULL, data TEXT NOT NULL
  );
  CREATE INDEX taskboard_execution_task ON taskboard_executions(task_key);
  CREATE TABLE taskboard_execution_events (
    execution_id TEXT NOT NULL, event_id TEXT NOT NULL, received_at TEXT NOT NULL,
    data TEXT NOT NULL, PRIMARY KEY(execution_id, event_id)
  );
`;
export function taskKey(task: TaskReference): string {
  return JSON.stringify([task.projectId, task.source, task.locator]);
}
const inactive = new Set(['canceled', 'verified', 'failed']);
export function createExecutionStore(db: Database.Database) {
  const decode = (row: unknown): ExecutionRun | null =>
    row
      ? executionRunSchema.parse(JSON.parse((row as { data: string }).data))
      : null;
  const get = (id: string) =>
    decode(
      db.prepare('SELECT data FROM taskboard_executions WHERE id=?').get(id)
    );
  const save = (run: ExecutionRun) => {
    const next = executionRunSchema.parse({ ...run, version: run.version + 1 });
    const result = db
      .prepare(
        'UPDATE taskboard_executions SET data=?, version=?, active_key=? WHERE id=? AND version=?'
      )
      .run(
        JSON.stringify(next),
        next.version,
        inactive.has(next.state) ? null : taskKey(next.request.task),
        next.id,
        run.version
      );
    if (result.changes !== 1)
      throw new Error('Execution changed; refresh before retrying');
    return next;
  };
  const insert = (run: ExecutionRun) => {
    db.prepare('INSERT INTO taskboard_executions VALUES (?,?,?,?,?,?,?)').run(
      run.id,
      run.request.task.projectId,
      taskKey(run.request.task),
      run.dispatchKey,
      taskKey(run.request.task),
      run.version,
      JSON.stringify(executionRunSchema.parse(run))
    );
    return run;
  };
  return {
    get,
    save,
    byDispatch(key: string) {
      return decode(
        db
          .prepare('SELECT data FROM taskboard_executions WHERE dispatch_key=?')
          .get(key)
      );
    },
    insert,
    insertFix(run: ExecutionRun, parent: ExecutionRun) {
      return db.transaction(() => {
        save({
          ...parent,
          state: 'failed',
          lastError: 'Verification failed; linked fix iteration created'
        });
        return insert(run);
      })();
    },
    list(task?: TaskReference): ExecutionRun[] {
      const rows = task
        ? db
            .prepare(
              'SELECT data FROM taskboard_executions WHERE task_key=? ORDER BY rowid DESC'
            )
            .all(taskKey(task))
        : db
            .prepare('SELECT data FROM taskboard_executions ORDER BY rowid')
            .all();
      return rows.map(row => decode(row)!);
    },
    event(
      id: string,
      eventId: string,
      data: unknown,
      apply: (run: ExecutionRun) => ExecutionRun
    ): ExecutionRun {
      return db.transaction(() => {
        const current = get(id);
        if (!current) throw new Error('Unknown execution');
        const added = db
          .prepare(
            'INSERT OR IGNORE INTO taskboard_execution_events VALUES (?,?,?,?)'
          )
          .run(id, eventId, new Date().toISOString(), JSON.stringify(data));
        if (!added.changes) return current;
        const next = apply(current);
        return next === current ? current : save(next);
      })();
    }
  };
}
export type ExecutionStore = ReturnType<typeof createExecutionStore>;
